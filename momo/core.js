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
    { id: "bundle", icon: "👀", title: "Zahlen-Blick", color: "sky" },
    { id: "place", icon: "🏠", title: "Zahlenhaus", color: "mint" },
    { id: "build", icon: "🏗️", title: "Zahlen bauen", color: "peach" },
    { id: "line", icon: "📏", title: "Zahlenstrahl", color: "sky" },
    { id: "chart", icon: "🟩", title: "Hundertertafel", color: "mint" },
    { id: "steps", icon: "👣", title: "Weiterzählen", color: "yellow" },
    { id: "compare", icon: "🐊", title: "Krokodil-Vergleich", color: "mint" },
    { id: "sort", icon: "🪜", title: "Zahlen ordnen", color: "lavender" },
    { id: "adjacent", icon: "🏘️", title: "Zahlen-Nachbarn", color: "peach" },
    { id: "calc", icon: "🔟", title: "Zehner rechnen", color: "rose" },
    { id: "graph", icon: "📶", title: "Säulen lesen", color: "yellow" },
    { id: "count", icon: "✋", title: "Wie viele?", color: "peach" },
    { id: "more", icon: "🍎", title: "Mehr oder weniger?", color: "rose" },
    { id: "venn", icon: "⭕", title: "Mengen-Kreise", color: "lavender" },
    { id: "cross", icon: "🌉", title: "Über den Zehner", color: "sky" },
    { id: "times", icon: "🔵", title: "Malfelder", color: "lavender" },
    { id: "money", icon: "🪙", title: "Geld zählen", color: "yellow" },
    { id: "clock", icon: "🕒", title: "Uhr lesen", color: "mint" },
    { id: "syllables", icon: "🥁", title: "Silben klatschen", color: "peach" },
    { id: "extend", icon: "🐍", title: "Wörter verlängern", color: "mint" },
  ];
  // Menu: subject → category → game. "report" names the category for adults.
  const SUBJECTS = [
    { id: "deutsch", icon: "📖", title: "Deutsch", color: "mint" },
    { id: "mathe", icon: "🔢", title: "Mathe", color: "sky" },
  ];
  const CATEGORIES = [
    {
      id: "hearing",
      subject: "deutsch",
      icon: "👂",
      title: "Laute üben",
      report: "Laute hören",
      color: "peach",
      games: ["type", "initial", "blend"],
    },
    {
      id: "abc",
      subject: "deutsch",
      icon: "🔤",
      title: "ABC üben",
      report: "ABC & Reihenfolge",
      color: "lavender",
      games: ["missing", "neighbor", "order"],
    },
    {
      id: "spelling",
      subject: "deutsch",
      icon: "✏️",
      title: "Richtig schreiben",
      report: "Rechtschreiben",
      color: "yellow",
      games: ["syllables", "extend", "merk"],
    },
    {
      id: "memory",
      subject: "deutsch",
      icon: "👥",
      title: "Zu zweit",
      report: "Merken & Nachsprechen",
      color: "rose",
      games: ["memory", "echo", "movement"],
    },
    {
      id: "sets",
      subject: "mathe",
      icon: "🧺",
      title: "Mengen",
      report: "Mengen & Zählen",
      color: "peach",
      games: ["count", "more", "venn"],
    },
    {
      id: "tens",
      subject: "mathe",
      icon: "🧮",
      title: "Zehner und Einer",
      report: "Zehner & Einer",
      color: "sky",
      games: ["bundle", "place", "build"],
    },
    {
      id: "space",
      subject: "mathe",
      icon: "🔎",
      title: "Zahlen finden",
      report: "Zahlenstrahl & Hundertertafel",
      color: "mint",
      games: ["line", "chart", "steps"],
    },
    {
      id: "compare",
      subject: "mathe",
      icon: "⚖️",
      title: "Vergleichen",
      report: "Vergleichen & Ordnen",
      color: "lavender",
      games: ["compare", "sort", "adjacent"],
    },
    {
      id: "calc",
      subject: "mathe",
      icon: "➕",
      title: "Rechnen",
      report: "Rechnen bis 100",
      color: "rose",
      games: ["calc", "cross"],
    },
    {
      id: "times",
      subject: "mathe",
      icon: "✖️",
      title: "Einmaleins",
      report: "Einmaleins",
      color: "lavender",
      games: ["times"],
    },
    {
      id: "sizes",
      subject: "mathe",
      icon: "👛",
      title: "Geld und Uhr",
      report: "Größen: Geld & Uhrzeit",
      color: "yellow",
      games: ["money", "clock"],
    },
    {
      id: "charts",
      subject: "mathe",
      icon: "📊",
      title: "Diagramme",
      report: "Diagramme lesen",
      color: "yellow",
      games: ["graph"],
    },
  ];
  const MATH_GAMES = CATEGORIES.filter((x) => x.subject === "mathe").flatMap(
    (x) => x.games,
  );
  function categoryOf(mode) {
    return CATEGORIES.find((category) => category.games.includes(mode)) || null;
  }

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
    // Base-ten blocks (rods of ten, single cubes) → pick the number.
    bundle: [
      { min: 11, max: 20, choices: 3, label: "bis 20, 3 Karten" },
      { min: 20, max: 50, choices: 3, label: "bis 50" },
      { min: 10, max: 99, choices: 3, label: "bis 99" },
      { min: 10, max: 99, choices: 4, swap: true, label: "bis 99, mit Zahlendreher" },
      {
        min: 10,
        max: 99,
        choices: 4,
        swap: true,
        mixed: true,
        label: "Einer manchmal vor den Zehnern",
      },
      {
        min: 10,
        max: 100,
        choices: 4,
        swap: true,
        mixed: true,
        round: true,
        label: "auch volle Zehner und 100",
      },
    ],
    // Place value: digits ↔ tens and ones.
    place: [
      { ask: ["tens"], min: 11, max: 50, choices: 3, label: "Zehner finden, bis 50" },
      { ask: ["ones"], min: 11, max: 50, choices: 3, label: "Einer finden, bis 50" },
      { ask: ["tens", "ones"], min: 11, max: 99, choices: 4, label: "Zehner oder Einer, bis 99" },
      { ask: ["compose"], min: 11, max: 99, choices: 3, label: "Zehner und Einer → Zahl" },
      { ask: ["swapped"], min: 11, max: 99, choices: 4, label: "erst die Einer, dann die Zehner" },
      {
        ask: ["tens", "ones", "compose", "swapped"],
        min: 10,
        max: 99,
        choices: 4,
        label: "alles gemischt",
      },
      { ask: ["bundle"], choices: 4, label: "mehr als 9 Einer bündeln" },
      { ask: ["split"], min: 11, max: 99, choices: 4, label: "zerlegen: 47 = 40 + 7" },
      {
        ask: ["tens", "ones", "compose", "swapped", "bundle", "split"],
        min: 10,
        max: 99,
        choices: 4,
        label: "alles gemischt, auch zerlegen",
      },
    ],
    // Lay a number with rods and cubes in the place-value house.
    build: [
      { min: 11, max: 20, label: "bis 20 legen" },
      { min: 20, max: 50, label: "bis 50 legen" },
      { min: 10, max: 99, label: "bis 99 legen" },
      { min: 10, max: 99, hidden: true, label: "Zahl nur hören" },
      { change: [10, -10], label: "10 mehr oder 10 weniger" },
      { change: [1, -1], label: "1 mehr oder 1 weniger" },
      { change: [1, -1, 10, -10], hidden: true, label: "gemischt, Zahl nicht sichtbar" },
    ],
    // A balloon on a number line: which number is it?
    line: [
      { span: 20, labels: 10, at: "any", choices: 3, label: "0 bis 20" },
      { span: 100, labels: 50, at: "tens", choices: 3, label: "0 bis 100, volle Zehner" },
      { span: 100, labels: 10, at: "fives", choices: 3, label: "0 bis 100, Fünfer" },
      { span: 20, labels: 10, at: "any", choices: 3, label: "Ausschnitt, 20 Zahlen" },
      { span: 20, labels: 20, at: "any", choices: 4, label: "nur Anfang und Ende beschriftet" },
      { span: 30, labels: 30, at: "any", choices: 4, label: "30 Zahlen, nur Anfang und Ende" },
      { span: 50, labels: 10, at: "any", choices: 4, label: "50 Zahlen" },
    ],
    // Pieces of the hundred chart: right is 1 more, down is 10 more.
    chart: [
      { shape: "row", max: 50, choices: 3, label: "Reihe: 1 mehr, 1 weniger" },
      { shape: "column", choices: 3, label: "Spalte: 10 mehr, 10 weniger" },
      { shape: "cross", choices: 3, label: "Kreuz um eine Zahl" },
      { shape: "window", choices: 4, label: "3×3-Ausschnitt" },
      { shape: "corner", choices: 4, label: "Ecken: schräg daneben" },
      { shape: "sparse", choices: 4, label: "nur eine Zahl gegeben" },
    ],
    // Counting on and back in steps.
    steps: [
      { steps: [1], length: 4, choices: 3, label: "immer 1 weiter" },
      { steps: [-1], length: 4, choices: 3, label: "immer 1 zurück" },
      { steps: [10, -10], length: 4, choices: 3, label: "10er-Schritte" },
      { steps: [2], length: 4, choices: 3, label: "2er-Schritte" },
      { steps: [5, -5], length: 4, choices: 4, label: "5er-Schritte" },
      { steps: [1, -1, 2, -2, 10], length: 5, gap: true, choices: 4, label: "Lücke in der Reihe" },
      { steps: [2, -2, 3, 5, -5, 10, -10], length: 5, gap: true, choices: 4, label: "alles gemischt" },
    ],
    // The crocodile always eats the bigger number: <, > (and =).
    compare: [
      { kind: "far", choices: 2, label: "ganz verschiedene Zehner" },
      { kind: "near", choices: 2, label: "Zehner direkt nebeneinander" },
      { kind: "sameTens", choices: 2, label: "gleiche Zehner" },
      { kind: "swapped", choices: 2, label: "Zahlendreher: 62 und 26" },
      { kind: "mixed", equal: true, choices: 3, label: "gemischt, auch =" },
      { kind: "sum", equal: true, choices: 3, label: "30 + 5 mit einer Zahl vergleichen" },
    ],
    // Tap the numbers in order.
    sort: [
      { count: 3, far: true, label: "3 Zahlen" },
      { count: 4, label: "4 Zahlen" },
      { count: 4, sameTens: true, label: "4 Zahlen, manche mit gleichen Zehnern" },
      { count: 5, label: "5 Zahlen" },
      { count: 4, swap: true, label: "mit Zahlendreher (46, 64)" },
      { count: 4, reverse: true, label: "von der größten zur kleinsten" },
      { count: 6, swap: true, sameTens: true, label: "6 Zahlen" },
    ],
    // Predecessor, successor and the neighbouring tens.
    adjacent: [
      { ask: ["after"], max: 50, choices: 3, label: "danach (Nachfolger), bis 50" },
      { ask: ["before"], max: 50, choices: 3, label: "davor (Vorgänger), bis 50" },
      { ask: ["after", "before"], cross: true, choices: 3, label: "über den Zehner: 39, 40" },
      { ask: ["between"], choices: 4, label: "dazwischen" },
      { ask: ["tenBelow"], choices: 3, label: "Nachbarzehner davor" },
      { ask: ["tenAbove"], choices: 3, label: "Nachbarzehner danach" },
      {
        ask: ["tenBelow", "tenAbove", "after", "before"],
        cross: true,
        choices: 4,
        label: "alles gemischt",
      },
    ],
    // Adding and subtracting tens, and on to the next full ten.
    calc: [
      { ops: ["T+T"], choices: 3, label: "Zehner plus Zehner: 50 + 30" },
      { ops: ["T-T"], choices: 3, label: "Zehner minus Zehner: 70 − 20" },
      { ops: ["N+T"], choices: 3, label: "Zahl plus Zehner: 52 + 30" },
      { ops: ["N-T"], choices: 3, label: "Zahl minus Zehner: 76 − 20" },
      { ops: ["fillUp"], choices: 4, label: "bis zum Nachbarzehner: 32 + _ = 40" },
      { ops: ["fillDown"], choices: 4, label: "zurück zum Nachbarzehner: 33 − _ = 30" },
      {
        ops: ["T+T", "T-T", "N+T", "N-T", "fillUp", "fillDown"],
        choices: 4,
        label: "alles gemischt",
      },
    ],
    // Bar charts with one box per child.
    // Grasp a quantity: ten frames, dice, tally marks, scattered things.
    count: [
      { show: "frame", max: 10, choices: 3, label: "bis 10 im Zehnerfeld" },
      { show: "frame", max: 20, choices: 3, label: "bis 20 im Zwanzigerfeld" },
      { show: "dice", choices: 3, label: "zwei Würfel" },
      { show: "tally", max: 20, choices: 3, label: "Strichliste bis 20" },
      { show: "scatter", max: 15, choices: 4, label: "durcheinander bis 15" },
      { show: "tally", max: 50, choices: 4, label: "Strichliste bis 50" },
      { show: "missing", choices: 4, label: "Wie viele fehlen bis 20?" },
    ],
    // Compare two sets: more, fewer, equal – and by how many.
    more: [
      { max: 10, gap: 3, ask: ["more"], choices: 2, label: "Wo sind mehr? bis 10" },
      { max: 10, gap: 2, ask: ["fewer"], choices: 2, label: "Wo sind weniger?" },
      { max: 10, gap: 1, ask: ["more", "fewer"], equal: true, choices: 3, label: "auch gleich viele" },
      { max: 20, gap: 1, ask: ["more", "fewer"], equal: true, choices: 3, label: "bis 20" },
      {
        max: 12,
        gap: 1,
        ask: ["more", "fewer"],
        equal: true,
        trap: true,
        choices: 3,
        label: "Achtung: groß heißt nicht viel",
      },
      { max: 10, gap: 1, ask: ["diff"], choices: 4, label: "Wie viele mehr? bis 10" },
      { max: 20, gap: 1, ask: ["diff"], trap: true, choices: 4, label: "Wie viele mehr? bis 20" },
    ],
    // Sorting into rings by two properties (set diagram with an intersection).
    // Adding and subtracting across a ten, best in steps via the full ten.
    cross: [
      { ops: ["E+E"], choices: 3, label: "über die 10: 7 + 5" },
      { ops: ["E-E"], choices: 3, label: "zurück über die 10: 13 − 5" },
      { ops: ["N+E"], choices: 3, label: "über den Zehner: 38 + 5" },
      { ops: ["N-E"], choices: 3, label: "zurück über den Zehner: 52 − 7" },
      { ops: ["step+", "step-"], choices: 4, label: "in Schritten: 38 + 2 + 3" },
      { ops: ["N+N"], carry: false, choices: 4, label: "zweistellig: 34 + 25" },
      { ops: ["N+N", "N-N"], carry: true, choices: 4, label: "mit Übergang: 38 + 25, 62 − 27" },
      {
        ops: ["E+E", "E-E", "N+E", "N-E", "N+N", "N-N"],
        carry: true,
        choices: 4,
        label: "alles gemischt",
      },
    ],
    // Times tables from dot arrays: core tasks (2, 5, 10), neighbours, swaps.
    times: [
      { ask: "count", rows: [2, 5, 10], max: 5, choices: 3, label: "Punktefeld: 2er, 5er, 10er" },
      { ask: "task", rows: [2, 5, 10], max: 5, choices: 3, label: "Welche Malaufgabe passt?" },
      { ask: "result", rows: [2, 5, 10], max: 10, choices: 3, label: "Kernaufgaben: 2er, 5er, 10er" },
      { ask: "result", rows: [2, 3, 4, 5, 10], max: 10, choices: 4, label: "2er bis 5er und 10er" },
      { ask: "neighbor", rows: [2, 3, 4, 5, 10], max: 10, choices: 4, label: "Nachbaraufgaben: 6 · 5 = 5 · 5 + 5" },
      { ask: "swap", rows: [3, 4, 6, 7, 8, 9], max: 10, choices: 4, label: "Tauschaufgaben: 4 · 7 = 7 · 4" },
      { ask: "result", rows: [2, 3, 4, 5, 6, 7, 8, 9, 10], max: 10, choices: 4, label: "alle Reihen" },
    ],
    // Coins and notes: count, pay exactly, change.
    money: [
      { coins: [1, 2, 5, 10], max: 20, unit: "ct", ask: "count", choices: 3, label: "Cent bis 20" },
      { coins: [1, 2, 5, 10, 20, 50], max: 100, unit: "ct", ask: "count", choices: 3, label: "Cent bis 100" },
      { coins: [1, 2, 5, 10], max: 30, unit: "€", ask: "count", choices: 3, label: "Euro bis 30" },
      { coins: [1, 2, 5, 10, 20, 50], max: 100, unit: "€", ask: "count", choices: 4, label: "Euro bis 100" },
      { coins: [1, 2, 5, 10, 20, 50], max: 100, unit: "ct", ask: "pay", choices: 3, label: "passend bezahlen" },
      { unit: "ct", ask: "change", choices: 4, label: "Rückgeld" },
      { coins: [1, 2, 5, 10, 20, 50], max: 100, unit: "€", ask: "pay", choices: 3, label: "passend bezahlen in Euro" },
    ],
    // Reading an analog clock: full, half, quarter hours, five-minute steps.
    clock: [
      { kinds: ["full"], choices: 3, label: "volle Stunden" },
      { kinds: ["full", "half"], choices: 3, label: "volle und halbe Stunden" },
      { kinds: ["half"], choices: 4, label: "halbe Stunden: halb 4" },
      { kinds: ["quarterPast", "quarterTo"], choices: 4, label: "Viertel nach, Viertel vor" },
      {
        kinds: ["full", "half", "quarterPast", "quarterTo"],
        digital: true,
        choices: 4,
        label: "auch als Digitalzeit: 3:30",
      },
      { kinds: ["five"], choices: 4, label: "5-Minuten-Schritte: 10 nach 3" },
      {
        kinds: ["full", "half", "quarterPast", "quarterTo", "five"],
        digital: true,
        choices: 4,
        label: "alles gemischt",
      },
    ],
    // Syllables: count them (clapping), then find a missing one.
    syllables: [
      { ask: "count", sizes: [1, 2], choices: 3, label: "1 oder 2 Silben" },
      { ask: "count", sizes: [1, 2, 3], choices: 3, label: "bis 3 Silben" },
      { ask: "count", sizes: [2, 3, 4], choices: 4, label: "bis 4 Silben" },
      { ask: "count", sizes: [1, 2, 3, 4, 5], picture: false, choices: 4, label: "nur hören, bis 5 Silben" },
      { ask: "gap", sizes: [2, 3], choices: 3, label: "Welche Silbe fehlt?" },
      { ask: "gap", sizes: [3, 4, 5], choices: 4, label: "Silbe fehlt, lange Wörter" },
    ],
    // Final d/t, g/k, b/p: lengthen the word and the ending can be heard.
    extend: [
      { ends: ["d", "t"], kinds: ["noun"], choices: 2, label: "d oder t: Hund, Brot" },
      { ends: ["g", "k", "b"], kinds: ["noun"], choices: 2, label: "g oder k, b oder p" },
      { ends: ["d", "t", "g", "k", "b"], kinds: ["noun"], choices: 2, label: "alle gemischt" },
      { ends: ["d", "t", "g", "k", "b"], kinds: ["noun"], picture: false, choices: 2, label: "ohne Bild" },
      { ends: ["d", "t", "g", "k", "b"], kinds: ["adjective"], choices: 2, label: "Eigenschaftswörter: gelb, rund" },
      {
        ends: ["d", "t", "g", "k", "b"],
        kinds: ["noun", "adjective"],
        picture: false,
        choices: 2,
        label: "alles, ohne Bild",
      },
    ],
    venn: [
      { rings: 1, sets: [0], choices: 2, label: "ein Kreis: drin oder draußen" },
      { rings: 2, sets: [0], noBoth: true, choices: 4, label: "zwei Kreise" },
      { rings: 2, sets: [0], choices: 4, label: "zwei Kreise, auch die Mitte" },
      { rings: 2, sets: [1, 2], choices: 4, label: "fliegen, Wasser, Tiere" },
      { rings: 2, sets: [0, 1, 2], ask: ["ring"], choices: 4, label: "Wie viele sind im Kreis?" },
      {
        rings: 2,
        sets: [0, 1, 2],
        ask: ["both", "none", "only"],
        choices: 4,
        label: "Mitte, nur ein Kreis, draußen",
      },
    ],
    graph: [
      { bars: 3, ask: ["value"], choices: 3, label: "3 Säulen ablesen" },
      { bars: 4, ask: ["value"], choices: 4, label: "4 Säulen ablesen" },
      { bars: 3, ask: ["most", "least"], choices: 3, label: "am meisten, am wenigsten" },
      { bars: 4, ask: ["value", "most", "least"], choices: 4, label: "gemischt, 4 Säulen" },
      { bars: 3, ask: ["diff"], choices: 3, label: "Wie viele mehr?" },
      { bars: 3, ask: ["sum"], choices: 3, label: "Wie viele zusammen?" },
      {
        bars: 4,
        ask: ["value", "most", "least", "diff", "sum"],
        choices: 4,
        label: "alles gemischt",
      },
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

  /*
   * Numbers are spoken as German words, so every voice says them the same
   * way. German says the ones first ("sieben-und-vierzig") but writes the tens
   * first – the classic source of swapped digits (74 for 47).
   */
  const UNIT_WORDS = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
  const TEEN_WORDS = ["zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
  const TEN_WORDS = ["", "zehn", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
  function numberWord(n) {
    if (!Number.isInteger(n) || n < 0 || n > 100) return String(n);
    if (n === 100) return "hundert";
    if (n < 10) return UNIT_WORDS[n];
    if (n < 20) return TEEN_WORDS[n - 10];
    const ones = n % 10;
    const tens = TEN_WORDS[Math.floor(n / 10)];
    return ones ? `${ones === 1 ? "ein" : UNIT_WORDS[ones]}und${tens}` : tens;
  }
  // "ein Zehner", "vier Einer"
  const countWord = (n) => (n === 1 ? "ein" : numberWord(n));
  const between = (min, max, random) => min + Math.floor(random() * (max - min + 1));
  const placeOf = (n) => ({ tens: Math.floor(n / 10), ones: n % 10 });
  function placeExplain(n) {
    const { tens, ones } = placeOf(n);
    return {
      text: `${n} = ${tens} Zehner und ${ones} Einer.`,
      speech: `${capitalize(numberWord(n))} sind ${countWord(tens)} Zehner und ${countWord(ones)} Einer.`,
    };
  }
  /*
   * Typical mistakes make the best distractors: swapped digits (74 for 47),
   * every piece counted as a one (4 + 7 = 11), one ten or one one off.
   * "forced" distractors are always included.
   */
  function numberChoices(n, forced, count, random) {
    const { tens, ones } = placeOf(n);
    return numberOptions(
      n,
      forced,
      [n + 1, n - 1, n + 10, n - 10, tens + ones, ones * 10 + tens],
      count,
      random,
    );
  }
  /*
   * Answer, forced typical mistakes, then distractors from the pool (1–100).
   * Near the ends of the number range the pool can run short; then the
   * closest free numbers fill up (never one of "exclude", e.g. shown ones).
   */
  function numberOptions(answer, forced, pool, count, random, exclude = []) {
    const free = (x) =>
      Number.isInteger(x) && x >= 1 && x <= 100 && x !== answer && !exclude.includes(x);
    const must = [
      ...new Set(forced.filter((x) => Number.isInteger(x) && x >= 0 && x !== answer)),
    ].slice(0, count - 1);
    const rest = shuffle(
      [...new Set(pool.filter(free))].filter((x) => !must.includes(x)),
      random,
    );
    for (let k = 1; must.length + rest.length < count - 1 && k < 100; k++)
      for (const x of [answer + k, answer - k])
        if (free(x) && !must.includes(x) && !rest.includes(x)) rest.push(x);
    return shuffle([answer, ...must, ...rest.slice(0, count - 1 - must.length)], random).map(
      String,
    );
  }
  const sign = (n) => (n < 0 ? "−" : "+");
  const signWord = (n) => (n < 0 ? "minus" : "plus");
  // "34 + 10 = 44." with the spoken twin.
  function sumExplain(from, delta, result) {
    return {
      text: `${from} ${sign(delta)} ${Math.abs(delta)} = ${result}.`,
      speech: `${capitalize(numberWord(from))} ${signWord(delta)} ${numberWord(Math.abs(delta))} ist ${numberWord(result)}.`,
    };
  }
  // Syllables are separated by "-"; every syllable has at least two letters,
  // so the voice never has to say a single letter.
  const SYLLABLE_WORDS = [
    ["🐶", "Hund"], ["🐭", "Maus"], ["⚽", "Ball"], ["🐑", "Schaf"], ["🌳", "Baum"], ["🏠", "Haus"],
    ["🌙", "Mond"], ["🐟", "Fisch"], ["🐮", "Kuh"], ["🍞", "Brot"], ["⭐", "Stern"], ["🚆", "Zug"],
    ["🚌", "Bus"], ["🎩", "Hut"],
    ["🐱", "Kat-ze"], ["☀️", "Son-ne"], ["☁️", "Wol-ke"], ["🌼", "Blu-me"], ["🍰", "Ku-chen"],
    ["🍐", "Bir-ne"], ["🦁", "Lö-we"], ["🐯", "Ti-ger"], ["🦓", "Ze-bra"], ["🌹", "Ro-se"],
    ["👃", "Na-se"], ["🛋️", "So-fa"], ["🍎", "Ap-fel"], ["🚲", "Fahr-rad"], ["🐰", "Ha-se"],
    ["☕", "Tas-se"], ["🎻", "Gei-ge"], ["🖌️", "Pin-sel"], ["⛄", "Schnee-mann"], ["🐪", "Ka-mel"],
    ["🍌", "Ba-na-ne"], ["🍅", "To-ma-te"], ["🚀", "Ra-ke-te"], ["🍉", "Me-lo-ne"], ["🦒", "Gi-raf-fe"],
    ["🐧", "Pin-gu-in"], ["🐊", "Kro-ko-dil"], ["☎️", "Te-le-fon"], ["🦜", "Pa-pa-gei"],
    ["🦋", "Schmet-ter-ling"], ["🥕", "Ka-rot-te"], ["🚁", "Hub-schrau-ber"], ["🍔", "Ham-bur-ger"],
    ["🍫", "Scho-ko-la-de"], ["🛁", "Ba-de-wan-ne"], ["🌈", "Re-gen-bo-gen"], ["🌻", "Son-nen-blu-me"],
    ["🐞", "Ma-ri-en-kä-fer"], ["🚂", "Lo-ko-mo-ti-ve"], ["🚒", "Feu-er-wehr-au-to"],
  ];
  /*
   * Words with a hard-sounding ending: [icon, word, lengthened form, kind].
   * The written ending is the last letter; lengthening makes it audible.
   */
  const EXTEND_WORDS = [
    ["🐶", "Hund", "Hunde", "noun"], ["🌙", "Mond", "Monde", "noun"], ["🧒", "Kind", "Kinder", "noun"],
    ["✋", "Hand", "Hände", "noun"], ["🌲", "Wald", "Wälder", "noun"], ["🖼️", "Bild", "Bilder", "noun"],
    ["🐴", "Pferd", "Pferde", "noun"], ["👕", "Hemd", "Hemden", "noun"], ["🚲", "Fahrrad", "Fahrräder", "noun"],
    ["🍞", "Brot", "Brote", "noun"], ["🎩", "Hut", "Hüte", "noun"], ["⛺", "Zelt", "Zelte", "noun"],
    ["⛵", "Boot", "Boote", "noun"], ["📦", "Paket", "Pakete", "noun"], ["🥗", "Salat", "Salate", "noun"],
    ["🐘", "Elefant", "Elefanten", "noun"],
    ["⛰️", "Berg", "Berge", "noun"], ["🚆", "Zug", "Züge", "noun"], ["✈️", "Flugzeug", "Flugzeuge", "noun"],
    ["🏰", "Burg", "Burgen", "noun"], ["🤴", "König", "Könige", "noun"], ["🛤️", "Weg", "Wege", "noun"],
    ["🎁", "Geschenk", "Geschenke", "noun"], ["🥤", "Getränk", "Getränke", "noun"],
    ["🧺", "Korb", "Körbe", "noun"], ["🦹", "Dieb", "Diebe", "noun"], ["🪄", "Zauberstab", "Zauberstäbe", "noun"],
    ["🟡", "gelb", "gelbe", "adjective"], ["🔵", "rund", "runde", "adjective"], ["🐗", "wild", "wilde", "adjective"],
    ["🧊", "kalt", "kalte", "adjective"], ["📢", "laut", "laute", "adjective"], ["🎨", "bunt", "bunte", "adjective"],
    ["💖", "lieb", "liebe", "adjective"], ["🦉", "klug", "kluge", "adjective"], ["💪", "stark", "starke", "adjective"],
    ["🤒", "krank", "kranke", "adjective"],
  ];
  // Endings that sound alike at the end of a word.
  const SOUND_TWINS = { d: "t", t: "d", g: "k", k: "g", b: "p", p: "b" };
  const SHOP_ITEMS = [
    { icon: "🍦", word: "Das Eis" },
    { icon: "🥨", word: "Die Brezel" },
    { icon: "🍎", word: "Der Apfel" },
    { icon: "🍬", word: "Das Bonbon" },
    { icon: "✏️", word: "Der Stift" },
    { icon: "🎈", word: "Der Luftballon" },
  ];
  const SET_ICONS = ["🍎", "⭐", "🐞", "🌸", "🍓", "⚽", "🐟", "🦋", "🍄", "🐥"];
  /*
   * Set diagrams: two properties ("rings") and things with [icon, article,
   * word, in ring 1, in ring 2]. Only clear cases, so every thing has one place.
   */
  const TIER = { label: "Tier", ask: "Ist es ein Tier?", yes: "ist ein Tier", no: "ist kein Tier" };
  const VENN_SETS = [
    {
      rings: [
        { label: "rot", ask: "Ist es rot?", yes: "ist rot", no: "ist nicht rot" },
        { label: "Obst", ask: "Ist es Obst?", yes: "ist Obst", no: "ist kein Obst" },
      ],
      items: [
        ["🍎", "der", "Apfel", 1, 1],
        ["🍓", "die", "Erdbeere", 1, 1],
        ["🍒", "die", "Kirsche", 1, 1],
        ["🍅", "die", "Tomate", 1, 0],
        ["🚒", "das", "Feuerwehrauto", 1, 0],
        ["🌹", "die", "Rose", 1, 0],
        ["🐞", "der", "Marienkäfer", 1, 0],
        ["🍌", "die", "Banane", 0, 1],
        ["🍐", "die", "Birne", 0, 1],
        ["🍇", "die", "Traube", 0, 1],
        ["🍋", "die", "Zitrone", 0, 1],
        ["🥦", "der", "Brokkoli", 0, 0],
        ["⚽", "der", "Ball", 0, 0],
        ["🐸", "der", "Frosch", 0, 0],
        ["🌳", "der", "Baum", 0, 0],
      ],
    },
    {
      rings: [
        { label: "kann fliegen", ask: "Kann es fliegen?", yes: "kann fliegen", no: "kann nicht fliegen" },
        TIER,
      ],
      items: [
        ["🐦", "der", "Vogel", 1, 1],
        ["🦋", "der", "Schmetterling", 1, 1],
        ["🐝", "die", "Biene", 1, 1],
        ["🦆", "die", "Ente", 1, 1],
        ["✈️", "das", "Flugzeug", 1, 0],
        ["🚁", "der", "Hubschrauber", 1, 0],
        ["🎈", "der", "Luftballon", 1, 0],
        ["🚀", "die", "Rakete", 1, 0],
        ["🐶", "der", "Hund", 0, 1],
        ["🐱", "die", "Katze", 0, 1],
        ["🐢", "die", "Schildkröte", 0, 1],
        ["🐘", "der", "Elefant", 0, 1],
        ["🚗", "das", "Auto", 0, 0],
        ["⚽", "der", "Ball", 0, 0],
        ["🏠", "das", "Haus", 0, 0],
        ["🧸", "der", "Teddy", 0, 0],
      ],
    },
    {
      rings: [
        { label: "im Wasser", ask: "Ist es im Wasser?", yes: "ist im Wasser", no: "ist nicht im Wasser" },
        TIER,
      ],
      items: [
        ["🐟", "der", "Fisch", 1, 1],
        ["🐳", "der", "Wal", 1, 1],
        ["🐙", "der", "Krake", 1, 1],
        ["🦀", "der", "Krebs", 1, 1],
        ["⛵", "das", "Segelboot", 1, 0],
        ["🚢", "das", "Schiff", 1, 0],
        ["🛶", "das", "Kanu", 1, 0],
        ["🐶", "der", "Hund", 0, 1],
        ["🐴", "das", "Pferd", 0, 1],
        ["🐘", "der", "Elefant", 0, 1],
        ["🐱", "die", "Katze", 0, 1],
        ["🚗", "das", "Auto", 0, 0],
        ["🏠", "das", "Haus", 0, 0],
        ["⚽", "der", "Ball", 0, 0],
        ["🌳", "der", "Baum", 0, 0],
      ],
    },
  ];
  const GRAPH_TOPICS = [
    {
      title: "Lieblingsobst",
      items: [
        { word: "Apfel", plural: "Äpfel", icon: "🍎" },
        { word: "Banane", plural: "Bananen", icon: "🍌" },
        { word: "Erdbeere", plural: "Erdbeeren", icon: "🍓" },
        { word: "Birne", plural: "Birnen", icon: "🍐" },
        { word: "Trauben", plural: "Trauben", icon: "🍇" },
      ],
    },
    {
      title: "Lieblingstiere",
      items: [
        { word: "Hund", plural: "Hunde", icon: "🐶" },
        { word: "Katze", plural: "Katzen", icon: "🐱" },
        { word: "Hase", plural: "Hasen", icon: "🐰" },
        { word: "Pferd", plural: "Pferde", icon: "🐴" },
        { word: "Fisch", plural: "Fische", icon: "🐟" },
      ],
    },
    {
      title: "Lieblingssport",
      items: [
        { word: "Fußball", plural: "Fußball", icon: "⚽" },
        { word: "Schwimmen", plural: "Schwimmen", icon: "🏊" },
        { word: "Tanzen", plural: "Tanzen", icon: "💃" },
        { word: "Judo", plural: "Judo", icon: "🥋" },
        { word: "Turnen", plural: "Turnen", icon: "🤸" },
      ],
    },
  ];
  function digitChoices(answer, other, count, random) {
    // The other digit of the number is the typical mix-up; near digits fill up.
    const pool = [...Array(10).keys()]
      .filter((x) => x !== answer && x !== other)
      .sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer))
      .slice(0, count);
    return withChoices([answer, other], pool, count, random).map(String);
  }

  function makeQuestion(mode, level = 0, previous = null, random = Math.random) {
    if (!LEVELS[mode]) throw new Error("Unbekanntes Spiel: " + mode);
    const config = LEVELS[mode][clampLevel(mode, level)];
    for (let attempt = 0; attempt < 8; attempt++) {
      const question = generate(mode, config, previous, random);
      // Merkwörter share letters; tasks with few possible answers (<, >, links,
      // rechts …) carry a "key" and must not repeat the whole task instead.
      const same =
        mode === "merk"
          ? question.word === previous?.word
          : question.key != null
            ? question.key === previous?.key
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
    if (mode === "bundle") {
      const roundTens = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].filter(
        (x) => x >= config.min && x <= config.max,
      );
      let number;
      do
        number =
          config.round && random() < 0.3
            ? pick(roundTens, random)
            : between(config.min, Math.min(config.max, 99), random);
      while (String(number) === previous?.answer);
      const { tens, ones } = placeOf(number);
      const swap = ones * 10 + tens;
      return {
        answer: String(number),
        number,
        tens,
        ones,
        onesFirst: Boolean(config.mixed) && random() < 0.5,
        swap: String(swap),
        choices: numberChoices(number, config.swap ? [swap] : [], config.choices, random),
        explain:
          number === 100
            ? { text: "100 = 10 Zehner.", speech: "Hundert sind zehn Zehner." }
            : placeExplain(number),
      };
    }
    if (mode === "place") {
      let question;
      do {
        const kind = pick(config.ask, random);
        let tens;
        let ones;
        if (kind === "bundle") {
          // More than nine ones: ten of them make one more ten (3 Z + 12 E = 42).
          tens = between(1, 8, random);
          ones = between(10, 19, random);
        } else
          do ({ tens, ones } = placeOf(between(config.min, config.max, random)));
          while (tens === ones || (["swapped", "split"].includes(kind) && ones === 0));
        const number = tens * 10 + ones;
        if (kind === "split") {
          // 47 = 40 + ? or 47 = ? + 7. Typical slips: 4 for 40, swapped digits.
          const findTens = random() < 0.5;
          const answer = findTens ? tens * 10 : ones;
          question = {
            kind,
            tens,
            ones,
            number,
            findTens,
            answer: String(answer),
            swap: String(findTens ? ones * 10 : tens),
            choices: numberOptions(
              answer,
              [tens, ones * 10],
              findTens ? [answer + 10, answer - 10, number] : [ones + 1, ones - 1, 10 - ones],
              config.choices,
              random,
            ),
            speech: findTens
              ? `${numberWord(number)} ist wie viel plus ${numberWord(ones)}?`
              : `${numberWord(number)} ist ${numberWord(tens * 10)} plus wie viel?`,
            explain: {
              text: `${number} = ${tens * 10} + ${ones}.`,
              speech: `${capitalize(numberWord(number))} ist ${numberWord(tens * 10)} plus ${numberWord(ones)}.`,
            },
            cue: `Vorlesen: ${number} = ${findTens ? "?" : tens * 10} + ${findTens ? ones : "?"}`,
          };
        } else if (kind === "tens" || kind === "ones") {
          const answer = kind === "tens" ? tens : ones;
          const other = kind === "tens" ? ones : tens;
          question = {
            kind,
            tens,
            ones,
            number,
            answer: String(answer),
            swap: String(other),
            choices: digitChoices(answer, other, config.choices, random),
            speech: numberWord(number),
            explain: placeExplain(number),
            cue: `Zahl: ${number}`,
          };
        } else {
          const swap = kind === "bundle" ? Number(`${tens}${ones}`) : ones * 10 + tens;
          const parts = [
            { n: tens, text: `${tens} Zehner`, speech: `${countWord(tens)} Zehner` },
            { n: ones, text: `${ones} Einer`, speech: `${countWord(ones)} Einer` },
          ];
          if (kind === "swapped") parts.reverse();
          question = {
            kind,
            tens,
            ones,
            number,
            answer: String(number),
            swap: String(swap),
            choices: numberChoices(
              number,
              kind === "bundle" ? [swap, number - 10] : [swap],
              config.choices,
              random,
            ),
            speech: `${parts[0].speech} und ${parts[1].speech}`,
            explain:
              kind === "bundle"
                ? {
                    text: `${tens} Zehner und ${ones} Einer sind ${number}. Denn 10 Einer sind 1 Zehner.`,
                    speech: `${capitalize(countWord(tens))} Zehner und ${numberWord(ones)} Einer sind ${numberWord(number)}. Denn zehn Einer sind ein Zehner.`,
                  }
                : placeExplain(number),
            cue: `Vorlesen: ${parts[0].text} und ${parts[1].text}`,
          };
        }
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "build") {
      let start = 0;
      let delta = 0;
      let number;
      do {
        if (config.change) {
          delta = pick(config.change, random);
          // ±1 never crosses a ten here, so no rod has to be broken up.
          const fits = (from) =>
            from + delta >= 10 &&
            from + delta <= 99 &&
            (Math.abs(delta) === 10 || placeOf(from).tens === placeOf(from + delta).tens);
          do start = between(11, 99, random);
          while (!fits(start));
          number = start + delta;
        } else number = between(config.min, config.max, random);
      } while (String(number) === previous?.answer);
      const target = placeOf(number);
      const amount = Math.abs(delta);
      return {
        answer: String(number),
        number,
        startNumber: start,
        start: placeOf(start),
        target,
        delta,
        hidden: Boolean(config.hidden),
        swap: target.tens !== target.ones ? String(target.ones * 10 + target.tens) : null,
        speech: delta ? null : numberWord(number),
        explain: delta
          ? {
              text: `${start} ${delta > 0 ? "+" : "−"} ${amount} = ${number}.`,
              speech: `${capitalize(numberWord(start))} ${delta > 0 ? "plus" : "minus"} ${numberWord(amount)} ist ${numberWord(number)}.`,
            }
          : placeExplain(number),
        cue: delta
          ? `Es liegt ${start}. Gesucht: ${amount} ${delta > 0 ? "mehr" : "weniger"} – Lösung: ${number}`
          : `Zahl: ${number}`,
      };
    }
    if (mode === "line") {
      const span = config.span;
      const from = span >= 100 ? 0 : 10 * between(0, (100 - span) / 10, random);
      const to = from + span;
      const step = { tens: 10, fives: 5 }[config.at] || 1;
      const labelled = (x) => (x - from) % config.labels === 0;
      const spots = [];
      for (let x = from + step; x < to; x += step)
        if (!labelled(x) && (config.at !== "fives" || x % 10)) spots.push(x);
      const number = pick(
        spots.filter((x) => String(x) !== previous?.answer),
        random,
      );
      const labels = [];
      for (let x = from; x <= to; x += config.labels) labels.push(x);
      // Help shows every ten and five; the nearest one below is where to count on.
      const helpLabels = [];
      for (let x = from; x <= to; x += 5)
        if (!labels.includes(x) && x !== number) helpLabels.push(x);
      const base = Math.max(...[...labels, ...helpLabels].filter((x) => x <= number));
      return {
        from,
        to,
        ticks: span > 50 ? 5 : 1,
        labels,
        helpLabels,
        base,
        number,
        answer: String(number),
        choices: numberOptions(
          number,
          [],
          [number + step, number - step, number + 2 * step, number - 2 * step, number + 10, number - 10, number + 1, number - 1].filter(
            (x) => x >= from && x <= to && x % step === 0,
          ),
          config.choices,
          random,
        ),
        explain: {
          text: `Der Ballon zeigt ${number}.`,
          speech: `Der Ballon zeigt ${numberWord(number)}.`,
        },
      };
    }
    if (mode === "chart") {
      const shapes = {
        row: [[0, -1], [0, 0], [0, 1]],
        column: [[-1, 0], [0, 0], [1, 0]],
        cross: [[-1, 0], [0, -1], [0, 0], [0, 1], [1, 0]],
      };
      const all = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) all.push([dr, dc]);
      const corners = all.filter(([dr, dc]) => dr && dc);
      let question;
      do {
        const row =
          config.shape === "row" ? between(0, (config.max || 100) / 10 - 1, random) : between(1, 8, random);
        const col = config.shape === "column" ? between(0, 9, random) : between(1, 8, random);
        const value = ([dr, dc]) => (row + dr) * 10 + col + dc + 1;
        const key = ([dr, dc]) => `${dr},${dc}`;
        let shown;
        let gap;
        if (shapes[config.shape]) {
          const cells = shapes[config.shape];
          gap = pick(config.shape === "cross" ? cells.filter(([dr, dc]) => dr || dc) : cells, random);
          shown = cells.filter((cell) => cell !== gap);
        } else if (config.shape === "window") {
          gap = pick(all, random);
          shown = all.filter((cell) => cell !== gap);
        } else if (config.shape === "corner") {
          gap = pick(corners, random);
          shown = shapes.cross;
        } else {
          gap = pick(all.filter(([dr, dc]) => dr || dc), random);
          shown = [[0, 0]];
        }
        const shownKeys = shown.map(key);
        // A single given number still shows the whole 3×3 window around it.
        const frame = config.shape === "sparse" ? all : [...shown, gap];
        const rows = [...new Set(frame.map(([dr]) => dr))].sort((a, b) => a - b);
        const cols = [...new Set(frame.map(([, dc]) => dc))].sort((a, b) => a - b);
        // A full rectangle, so empty cells keep the chart's shape.
        const grid = [];
        for (let dr = rows[0]; dr <= rows.at(-1); dr++) {
          const line = [];
          for (let dc = cols[0]; dc <= cols.at(-1); dc++) {
            const cell = [dr, dc];
            line.push({
              n: value(cell),
              state:
                key(cell) === key(gap) ? "gap" : shownKeys.includes(key(cell)) ? "shown" : "empty",
            });
          }
          grid.push(line);
        }
        // Explain from the centre if shown, else from the first shown cell.
        const ref = shownKeys.includes("0,0") ? [0, 0] : shown[0];
        const answer = value(gap);
        const [odr, odc] = [gap[0] - ref[0], gap[1] - ref[1]];
        // Typical slip: rows and columns mixed up (1 instead of 10).
        const confused = value(ref) + odr + odc * 10;
        question = {
          grid,
          answer: String(answer),
          number: answer,
          ref: value(ref),
          shown: shown.map(value),
          choices: numberOptions(
            answer,
            confused !== answer && confused >= 1 && confused <= 100 ? [confused] : [],
            [answer + 1, answer - 1, answer + 10, answer - 10, answer + 11, answer - 11, answer + 9, answer - 9],
            config.choices,
            random,
          ),
          explain: sumExplain(value(ref), answer - value(ref), answer),
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "steps") {
      let question;
      do {
        const step = pick(config.steps, random);
        const span = Math.abs(step) * (config.length - 1);
        const align = [2, 5].includes(Math.abs(step)) ? Math.abs(step) : 1;
        const starts = [];
        for (let x = step > 0 ? 1 : span + 1; x <= (step > 0 ? 100 - span : 100); x++)
          if (x % align === 0) starts.push(x);
        const start = pick(starts, random);
        const sequence = Array.from({ length: config.length }, (_, i) => start + i * step);
        const gap = config.gap ? between(1, config.length - 2, random) : config.length - 1;
        const answer = sequence[gap];
        const words = sequence.map((x, i) =>
          i === gap ? (gap === config.length - 1 ? "und dann?" : "Lücke") : numberWord(x),
        );
        question = {
          sequence,
          gap,
          step,
          number: answer,
          answer: String(answer),
          choices: numberOptions(
            answer,
            [],
            [answer + 1, answer - 1, answer + step, answer - 2 * step, answer + 10, answer - 10],
            config.choices,
            random,
            sequence,
          ),
          speech: words.join(", "),
          explain: {
            text: `Immer ${sign(step)} ${Math.abs(step)}: ${answer}.`,
            speech: `Immer ${signWord(step)} ${numberWord(Math.abs(step))}. Also ${numberWord(answer)}.`,
          },
          cue: `Vorlesen: ${sequence.map((x, i) => (i === gap ? "?" : x)).join(", ")}`,
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "compare") {
      const kind =
        config.kind === "mixed" ? pick(["far", "near", "sameTens", "swapped"], random) : config.kind;
      const digit = () => between(1, 9, random);
      const side = (value) => ({ text: String(value), value, speech: numberWord(value) });
      let left;
      let right;
      let swapped = false;
      if (kind === "sum") {
        // 30 + 5 against 35 (equal), 53 (swapped digits) or a near number.
        let tens;
        let ones;
        do [tens, ones] = [digit(), digit()];
        while (tens === ones);
        const value = tens * 10 + ones;
        left = {
          text: `${tens * 10} + ${ones}`,
          value,
          speech: `${numberWord(tens * 10)} plus ${numberWord(ones)}`,
        };
        const other = pick([value, ones * 10 + tens, value + 1, value - 1], random);
        swapped = other === ones * 10 + tens;
        right = side(other);
      } else {
        let a;
        let b;
        if (config.equal && random() < 0.2) a = b = between(10, 99, random);
        else if (kind === "swapped") {
          let tens;
          let ones;
          do [tens, ones] = [digit(), digit()];
          while (tens === ones);
          [a, b] = [tens * 10 + ones, ones * 10 + tens];
          swapped = true;
        } else {
          let ta;
          let tb;
          do [ta, tb] = [digit(), digit()];
          while (
            kind === "far" ? Math.abs(ta - tb) < 3 : kind === "near" ? Math.abs(ta - tb) !== 1 : ta !== tb
          );
          let oa;
          let ob;
          do [oa, ob] = [between(0, 9, random), between(0, 9, random)];
          // Near tens: the smaller number gets the bigger ones (37 and 41).
          while (
            (kind === "sameTens" && oa === ob) ||
            (kind === "near" && (ta < tb ? oa <= ob : oa >= ob))
          );
          [a, b] = [ta * 10 + oa, tb * 10 + ob];
        }
        if (random() < 0.5) [a, b] = [b, a];
        left = side(a);
        right = side(b);
      }
      const answer = left.value < right.value ? "<" : left.value > right.value ? ">" : "=";
      const words = { "<": "ist kleiner als", ">": "ist größer als", "=": "ist genauso viel wie" };
      return {
        kind,
        left,
        right,
        key: `${left.text}|${right.text}`,
        answer,
        swap: swapped && answer !== "=" ? (answer === "<" ? ">" : "<") : null,
        choices: config.equal ? ["<", "=", ">"] : ["<", ">"],
        speech: `${left.speech} und ${right.speech}`,
        explain: {
          text: `${left.text} ${words[answer]} ${right.text}.`,
          speech: `${capitalize(left.speech)} ${words[answer]} ${right.speech}.`,
        },
        cue: `Vorlesen: ${left.text} und ${right.text}`,
      };
    }
    if (mode === "sort") {
      const set = new Set();
      const tensUsed = () => [...set].map((x) => Math.floor(x / 10));
      if (config.swap) {
        let tens;
        let ones;
        do [tens, ones] = [between(1, 9, random), between(1, 9, random)];
        while (tens === ones);
        set.add(tens * 10 + ones).add(ones * 10 + tens);
      }
      if (config.sameTens) {
        const tens = between(1, 9, random);
        while ([...set].filter((x) => Math.floor(x / 10) === tens).length < 2)
          set.add(tens * 10 + between(0, 9, random));
      }
      while (set.size < config.count) {
        const x = between(10, 99, random);
        if (!config.far || !tensUsed().includes(Math.floor(x / 10))) set.add(x);
      }
      const numbers = [...set];
      const order = [...numbers].sort((a, b) => (config.reverse ? b - a : a - b)).map(String);
      let cards = shuffle(order, random);
      if (cards.join() === order.join()) cards = [...cards.slice(1), cards[0]];
      const joiner = config.reverse ? " > " : " < ";
      return {
        order,
        cards,
        reverse: Boolean(config.reverse),
        answer: order.join(joiner),
        explain: {
          text: `${order.join(joiner)}.`,
          speech: `${config.reverse ? "Von groß nach klein" : "Von klein nach groß"}: ${order.map((x) => numberWord(Number(x))).join(", ")}.`,
        },
      };
    }
    if (mode === "adjacent") {
      let question;
      do {
        const kind = pick(config.ask, random);
        const max = config.max || 100;
        let n;
        if (kind === "tenBelow" || kind === "tenAbove")
          do n = between(11, 99, random);
          while (n % 10 === 0);
        else if (config.cross && random() < 0.5)
          // Across a ten: 39 → 40, 40 → 39.
          n = kind === "after" ? between(1, 9, random) * 10 + 9 : between(1, 9, random) * 10;
        else n = between(11, kind === "before" ? max : max - 1, random);
        const below = Math.floor(n / 10) * 10;
        const answer = {
          after: n + 1,
          before: n - 1,
          between: n,
          tenBelow: below,
          tenAbove: below + 10,
        }[kind];
        const forced = {
          after: n % 10 === 9 ? [below] : [],
          before: n % 10 === 0 && n + 9 <= 99 ? [n + 9] : [],
          between: [],
          tenBelow: [below + 10],
          tenAbove: [below],
        }[kind];
        const pool = {
          after: [n - 1, n + 2, n + 10],
          before: [n + 1, n - 2, n - 10],
          between: [n + 2, n - 2, n + 10, n - 10],
          tenBelow: [n, below - 10, n - 1, below + 20],
          tenAbove: [n + 1, below + 20, below - 10, n],
        }[kind];
        const shown = kind === "between" ? [n - 1, n + 1] : [n];
        const lineFrom = Math.floor(Math.min(n, answer) / 10) * 10;
        const explain =
          kind === "after" || kind === "before"
            ? sumExplain(n, answer - n, answer)
            : kind === "between"
              ? {
                  text: `${n} liegt zwischen ${n - 1} und ${n + 1}.`,
                  speech: `${capitalize(numberWord(n))} liegt zwischen ${numberWord(n - 1)} und ${numberWord(n + 1)}.`,
                }
              : {
                  text: `Die Nachbarzehner von ${n} sind ${below} und ${below + 10}.`,
                  speech: `Die Nachbarzehner von ${numberWord(n)} sind ${numberWord(below)} und ${numberWord(below + 10)}.`,
                };
        question = {
          kind,
          number: n,
          shown,
          answer: String(answer),
          choices: numberOptions(answer, forced, pool, config.choices, random),
          line: { from: lineFrom, to: Math.min(100, lineFrom + 20) },
          speech: shown.map(numberWord).join(" und "),
          explain,
          cue: `Vorlesen: ${shown.join(" und ")}`,
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "calc") {
      let question;
      do {
        const op = pick(config.ops, random);
        const nonRound = (min, max) => {
          let x;
          do x = between(min, max, random);
          while (x % 10 === 0);
          return x;
        };
        let a;
        let b;
        const minus = op.includes("-") || op === "fillDown";
        if (op === "T+T") {
          a = 10 * between(1, 8, random);
          b = 10 * between(1, 10 - a / 10, random);
        } else if (op === "T-T") {
          a = 10 * between(2, 10, random);
          b = 10 * between(1, a / 10 - 1, random);
        } else if (op === "N+T") {
          a = nonRound(11, 89);
          b = 10 * between(1, Math.floor((99 - a) / 10), random);
        } else if (op === "N-T") {
          a = nonRound(21, 99);
          b = 10 * between(1, Math.floor(a / 10) - 1, random);
        } else if (op === "fillUp") {
          a = nonRound(11, 99);
          b = 10 - (a % 10);
        } else {
          a = nonRound(11, 99);
          b = a % 10;
        }
        const result = minus ? a - b : a + b;
        const fill = op.startsWith("fill");
        const answer = fill ? b : result;
        const word = minus ? "minus" : "plus";
        // Typical slips: forgetting the zero (5 + 3 = 8), adding to the ones
        // (52 + 3 = 55), or taking the ones digit when filling up.
        const forced = {
          "T+T": [a / 10 + b / 10],
          "T-T": [a / 10 - b / 10],
          "N+T": [a + b / 10],
          "N-T": [a - b / 10],
          fillUp: [a % 10],
          fillDown: [10 - b],
        }[op];
        const pool = fill ? [b + 1, b - 1, 10, b + 10] : [result + 10, result - 10, result + 1, result - 1];
        question = {
          op,
          a,
          b,
          minus,
          result,
          fill,
          number: answer,
          answer: String(answer),
          choices: numberOptions(answer, forced, pool, config.choices, random),
          speech: fill
            ? `${numberWord(a)} ${word} wie viel ist ${numberWord(result)}?`
            : `${numberWord(a)} ${word} ${numberWord(b)}`,
          explain: sumExplain(a, minus ? -b : b, result),
          cue: `Vorlesen: ${a} ${minus ? "−" : "+"} ${fill ? "?" : b} = ${fill ? result : "?"}`,
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "cross") {
      let question;
      do {
        const op = pick(config.ops, random);
        const digit = () => between(2, 9, random);
        let a;
        let b;
        let forced;
        let steps;
        if (op === "E+E") {
          do [a, b] = [digit(), digit()];
          while (a + b <= 10);
          forced = [(a + b) % 10];
          steps = [10 - a, b - (10 - a)];
        } else if (op === "E-E") {
          do [a, b] = [between(11, 18, random), digit()];
          while (a % 10 >= b || a - b >= 10);
          forced = [b - (a % 10)];
          steps = [-(a % 10), -(b - (a % 10))];
        } else if (op === "N+E" || op === "step+") {
          do [a, b] = [between(11, 89, random), digit()];
          while (a % 10 === 0 || (a % 10) + b <= 10);
          forced = [a - (a % 10) + (((a % 10) + b) % 10)];
          steps = [10 - (a % 10), b - (10 - (a % 10))];
        } else if (op === "N-E" || op === "step-") {
          do [a, b] = [between(21, 99, random), digit()];
          while (a % 10 === 0 || a % 10 >= b);
          forced = [a - (a % 10) + (b - (a % 10))];
          steps = [-(a % 10), -(b - (a % 10))];
        } else {
          // Two two-digit numbers: first the tens, then the ones.
          const minus = op === "N-N";
          do {
            [a, b] = [between(21, 89, random), between(11, 69, random)];
            if (minus && a < b) [a, b] = [b, a];
          } while (
            (minus
              ? config.carry
                ? a % 10 >= b % 10 || b % 10 === 0
                : a % 10 < b % 10
              : config.carry
                ? (a % 10) + (b % 10) <= 10 || a + b > 100
                : (a % 10) + (b % 10) >= 10 || a + b > 99) || a === b
          );
          const tens = b - (b % 10);
          forced = minus
            ? [Math.floor(a / 10) * 10 - tens + Math.abs((a % 10) - (b % 10))]
            : [a + b - 10];
          steps = minus ? [-tens, -(b % 10)] : [tens, b % 10];
        }
        const minus = op.includes("-");
        const result = minus ? a - b : a + b;
        const step = op.startsWith("step");
        const answer = step ? Math.abs(steps[1]) : result;
        const sign = minus ? "−" : "+";
        const word = minus ? "minus" : "plus";
        // [numbers and signs]; null is the gap.
        const parts = step
          ? [a, sign, b, "=", a, sign, Math.abs(steps[0]), sign, null]
          : [a, sign, b, "=", null];
        question = {
          op,
          a,
          b,
          minus,
          result,
          steps,
          parts,
          number: answer,
          answer: String(answer),
          choices: numberOptions(
            answer,
            step ? [b] : forced,
            [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2],
            config.choices,
            random,
          ),
          speech: step
            ? `${numberWord(a)} ${word} ${numberWord(b)} ist ${numberWord(a)} ${word} ${numberWord(Math.abs(steps[0]))} ${word} wie viel?`
            : `${numberWord(a)} ${word} ${numberWord(b)}`,
          explain: {
            text: `${a} ${sign} ${Math.abs(steps[0])} ${sign} ${Math.abs(steps[1])} = ${result}.`,
            speech: `${capitalize(numberWord(a))} ${word} ${numberWord(Math.abs(steps[0]))} ist ${numberWord(a + steps[0])}, ${word} ${numberWord(Math.abs(steps[1]))} ist ${numberWord(result)}.`,
          },
          cue: `Vorlesen: ${parts.map((x) => (x === null ? "?" : x)).join(" ")}`,
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "times") {
      let question;
      do {
        const k = pick(config.rows, random);
        const field = ["count", "task"].includes(config.ask);
        let n = between(field ? 2 : 1, config.max, random);
        let core = null;
        if (config.ask === "neighbor") {
          // Next to a core task (2, 5 or 10 times): one row more or less.
          core = pick([2, 5, 10], random);
          n = core === 10 ? 9 : core + pick([-1, 1], random);
        }
        if (config.ask === "swap") while (n === k || n < 2) n = between(2, config.max, random);
        const product = n * k;
        const times = (x, y) => `${x} · ${y}`;
        const timesWord = (x, y) => `${numberWord(x)} mal ${numberWord(y)}`;
        let answer = String(product);
        let choices;
        let say = null;
        if (config.ask === "task") {
          // The swapped task (k · n) would also be right, so it is never offered.
          const wrong = [
            [n + 1, k],
            [n - 1, k],
            [n, k + 1],
            [n, k - 1],
          ].filter(([x, y]) => x >= 1 && y >= 1 && !(x === k && y === n));
          answer = times(n, k);
          const options = [answer, `${n} + ${k}`, ...shuffle(wrong, random).map(([x, y]) => times(x, y))];
          choices = shuffle([...new Set(options)].slice(0, config.choices), random);
          say = Object.fromEntries(
            choices.map((choice) => {
              const [x, sign, y] = choice.split(" ");
              return [choice, `${numberWord(Number(x))} ${sign === "+" ? "plus" : "mal"} ${numberWord(Number(y))}`];
            }),
          );
        } else
          choices = numberOptions(
            product,
            core ? [core * k + (n > core ? 1 : -1)] : [n + k],
            [product + k, product - k, product + 1, product - 1, product + n],
            config.choices,
            random,
          );
        const known =
          config.ask === "neighbor"
            ? { text: `${times(core, k)} = ${core * k}`, speech: `${timesWord(core, k)} ist ${numberWord(core * k)}.` }
            : config.ask === "swap"
              ? { text: `${times(k, n)} = ${product}`, speech: `${timesWord(k, n)} ist ${numberWord(product)}.` }
              : null;
        const explain = {
          count: {
            text: `${n} Reihen mit je ${k}: ${times(n, k)} = ${product}.`,
            speech: `${capitalize(numberWord(n))} Reihen mit je ${numberWord(k)}: ${timesWord(n, k)} ist ${numberWord(product)}.`,
          },
          task: {
            text: `${n} Reihen mit je ${k}: ${times(n, k)} = ${product}.`,
            speech: `${capitalize(numberWord(n))} Reihen mit je ${numberWord(k)}: ${timesWord(n, k)}.`,
          },
          neighbor: core && {
            text: `${times(core, k)} = ${core * k}, ${n > core ? "plus" : "minus"} ${k}: ${times(n, k)} = ${product}.`,
            speech: `${capitalize(timesWord(core, k))} ist ${numberWord(core * k)}, ${n > core ? "plus" : "minus"} ${numberWord(k)} ist ${numberWord(product)}.`,
          },
          swap: {
            text: `${times(k, n)} = ${times(n, k)} = ${product}. Tauschaufgaben haben das gleiche Ergebnis.`,
            speech: `${capitalize(timesWord(n, k))} ist auch ${numberWord(product)}. Tauschaufgaben haben das gleiche Ergebnis.`,
          },
        }[config.ask] || {
          text: `${times(n, k)} = ${product}.`,
          speech: `${capitalize(timesWord(n, k))} ist ${numberWord(product)}.`,
        };
        question = {
          ask: config.ask,
          rows: n,
          cols: k,
          core,
          known,
          number: product,
          key: `${n}x${k}|${config.ask}`,
          answer,
          choices,
          say,
          speech: field ? undefined : `${known ? `${known.speech} ` : ""}${timesWord(n, k)}?`,
          explain,
        };
      } while (question.key === previous?.key);
      return question;
    }
    if (mode === "money") {
      const euro = config.unit === "€";
      const unit = euro ? "€" : "ct";
      const unitWord = euro ? "Euro" : "Cent";
      const item = pick(SHOP_ITEMS, random);
      if (config.ask === "change") {
        const paid = pick([50, 100], random);
        const back = 5 * between(1, paid / 5 - 1, random);
        const price = paid - back;
        const paidText = paid === 100 ? "1 €" : "50 ct";
        const paidWord = paid === 100 ? "einem Euro" : "fünfzig Cent";
        return {
          ask: "change",
          paid,
          price,
          unit: "ct",
          item,
          key: `${paid}|${price}`,
          answer: String(back),
          number: back,
          choices: numberOptions(back, [price], [back + 5, back - 5, back + 10, back - 10, back + 1], config.choices, random),
          question: `${item.word} kostet ${price} ct. Du zahlst mit ${paidText}. Wie viel bekommst du zurück?`,
          questionSpeech: `${item.word} kostet ${numberWord(price)} Cent. Du zahlst mit ${paidWord}. Wie viel bekommst du zurück?`,
          explain: {
            text: `${paid} ct − ${price} ct = ${back} ct.`,
            speech: `${capitalize(numberWord(paid))} minus ${numberWord(price)} ist ${numberWord(back)}. Du bekommst ${numberWord(back)} Cent zurück.`,
          },
        };
      }
      // Random coins and notes that add up to a total (at most six pieces).
      const split = (total) => {
        for (let attempt = 0; attempt < 30; attempt++) {
          const coins = [];
          let rest = total;
          while (rest > 0 && coins.length < 6) {
            const fit = config.coins.filter((coin) => coin <= rest);
            coins.push(random() < 0.6 ? Math.max(...fit) : pick(fit, random));
            rest -= coins.at(-1);
          }
          if (rest === 0) return coins.sort((x, y) => y - x);
        }
        const coins = [];
        let rest = total;
        for (const coin of [...config.coins].sort((x, y) => y - x))
          while (rest >= coin) {
            coins.push(coin);
            rest -= coin;
          }
        return coins;
      };
      if (config.ask === "pay") {
        const price = between(5, config.max - 10, random);
        const sums = shuffle(
          [price + 1, price - 1, price + 2, price - 2, price + 5, price - 5, price + 10, price - 10].filter(
            (x) => x >= 1 && x <= config.max,
          ),
          random,
        ).slice(0, config.choices - 1);
        const sets = shuffle(
          [{ total: price, coins: split(price) }, ...sums.map((total) => ({ total, coins: split(total) }))],
          random,
        ).map((set, i) => ({ ...set, id: "abc"[i] }));
        return {
          ask: "pay",
          unit,
          item,
          price,
          sets,
          key: `${price}|${unit}`,
          answer: sets.find((set) => set.total === price).id,
          choices: sets.map((set) => set.id),
          question: `${item.word} kostet ${price} ${unit}. Womit kannst du genau bezahlen?`,
          questionSpeech: `${item.word} kostet ${numberWord(price)} ${unitWord}. Womit kannst du genau bezahlen?`,
          explain: {
            text: `${sets.find((set) => set.total === price).coins.join(" + ")} = ${price} ${unit}.`,
            speech: `Das sind genau ${numberWord(price)} ${unitWord}.`,
          },
        };
      }
      let total;
      do total = between(Math.ceil(config.max / 4), config.max, random);
      while (String(total) === previous?.answer);
      const coins = split(total);
      return {
        ask: "count",
        unit,
        coins: shuffle(coins, random),
        number: total,
        answer: String(total),
        // Typical slip: counting the pieces instead of their value.
        choices: numberOptions(total, [coins.length], [total + 1, total - 1, total + 2, total + 5, total - 5, total + 10, total - 10], config.choices, random),
        say: null,
        explain: {
          text: `${coins.join(" + ")} = ${total} ${unit}.`,
          speech: `Zusammen sind es ${numberWord(total)} ${unitWord}.`,
        },
      };
    }
    if (mode === "clock") {
      const norm = (h) => ((h - 1 + 120) % 12) + 1;
      const hourWord = (h) => (h === 1 ? "ein" : numberWord(h));
      // German clock words: "halb 4" is 3:30, "Viertel vor 4" is 3:45.
      const words = (h, m) => {
        const next = norm(h + 1);
        const say = (text, speech) => ({ text, speech });
        if (m === 0) return say(`${h} Uhr`, `${hourWord(h)} Uhr`);
        if (m === 30) return say(`halb ${next}`, `halb ${numberWord(next)}`);
        if (m === 15) return say(`Viertel nach ${h}`, `Viertel nach ${numberWord(h)}`);
        if (m === 45) return say(`Viertel vor ${next}`, `Viertel vor ${numberWord(next)}`);
        if (m === 25) return say(`5 vor halb ${next}`, `fünf vor halb ${numberWord(next)}`);
        if (m === 35) return say(`5 nach halb ${next}`, `fünf nach halb ${numberWord(next)}`);
        if (m < 30) return say(`${m} nach ${h}`, `${numberWord(m)} nach ${numberWord(h)}`);
        return say(`${60 - m} vor ${next}`, `${numberWord(60 - m)} vor ${numberWord(next)}`);
      };
      const digits = (h, m) => ({
        text: `${h}:${String(m).padStart(2, "0")}`,
        speech: `${hourWord(h)} Uhr${m ? ` ${numberWord(m)}` : ""}`,
      });
      let question;
      do {
        const kind = pick(config.kinds, random);
        const h = between(1, 12, random);
        const m = { full: 0, half: 30, quarterPast: 15, quarterTo: 45 }[kind] ?? pick([5, 10, 20, 25, 35, 40, 50, 55], random);
        const format = config.digital && random() < 0.5 ? digits : words;
        // Typical slips first: "halb 3" for 3:30, hands mixed up, an hour off.
        const forced = {
          full: [12, (h * 5) % 60],
          half: [norm(h - 1), 30],
          quarterPast: [norm(h - 1), 45],
          quarterTo: [norm(h + 1), 15],
          five: [h, 60 - m],
        }[kind];
        const others = shuffle(
          [
            [norm(h + 1), m],
            [norm(h - 1), m],
            [norm(h + 2), m],
            [h, (m + 30) % 60],
            [h, (m + 15) % 60],
            [norm(h + 1), (m + 30) % 60],
          ],
          random,
        );
        // Wrong answers only use times already learned on this level.
        const minutes = { full: [0], half: [30], quarterPast: [15], quarterTo: [45] };
        const known = (y) =>
          config.kinds.includes("five") || config.kinds.some((x) => minutes[x].includes(y));
        const answer = format(h, m);
        const labels = [answer];
        for (const [x, y] of [forced, ...others].filter(([, y]) => known(y))) {
          const label = format(x, y);
          if (labels.length < config.choices && !labels.some((other) => other.text === label.text))
            labels.push(label);
        }
        question = {
          kind,
          hour: h,
          minute: m,
          digital: format === digits,
          answer: answer.text,
          choices: shuffle(labels.map((label) => label.text), random),
          say: Object.fromEntries(labels.map((label) => [label.text, label.speech])),
          question: "Wie spät ist es?",
          explain: {
            text: `Es ist ${answer.text}.`,
            speech: `Es ist ${answer.speech}.`,
          },
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "syllables") {
      const words = SYLLABLE_WORDS.map(([icon, spelled]) => ({
        icon,
        syllables: spelled.split("-"),
        word: spelled.replace(/-/g, ""),
      }));
      const item = pick(
        words.filter(
          (x) => config.sizes.includes(x.syllables.length) && x.word !== previous?.word,
        ),
        random,
      );
      const count = item.syllables.length;
      const base = {
        ...item,
        // Only a few possible answers: the word must not repeat, the answer may.
        key: item.word,
        picture: config.picture !== false,
        speech: item.word,
        cue: `Wort: „${item.word}“`,
      };
      if (config.ask === "count")
        return {
          ...base,
          ask: "count",
          answer: String(count),
          choices: numberOptions(count, [], [count + 1, count - 1, count + 2], config.choices, random),
          explain: {
            text: `${item.syllables.join(" – ")}: ${count} ${count === 1 ? "Silbe" : "Silben"}.`,
            speech: `${item.word} hat ${count === 1 ? "eine Silbe" : `${numberWord(count)} Silben`}.`,
          },
        };
      const gap = between(0, count - 1, random);
      const answer = item.syllables[gap];
      // Other syllables of the same word and of other words as distractors.
      const fit = (syllable) =>
        gap === 0 ? capitalize(syllable.toLowerCase()) : syllable.toLowerCase();
      const pool = shuffle(
        [
          ...item.syllables.filter((_, i) => i !== gap),
          ...shuffle(words.flatMap((x) => x.syllables), random).slice(0, 12),
        ].map(fit),
        random,
      );
      const choices = [answer];
      for (const syllable of pool)
        if (choices.length < config.choices && !choices.includes(syllable)) choices.push(syllable);
      return {
        ...base,
        ask: "gap",
        gap,
        answer,
        choices: shuffle(choices, random),
        explain: {
          text: `${item.syllables.join(" – ")}.`,
          speech: `${item.syllables.join(", ")}. ${item.word}.`,
        },
      };
    }
    if (mode === "extend") {
      const item = pick(
        EXTEND_WORDS.map(([icon, word, long, kind]) => ({ icon, word, long, kind, end: word.at(-1) })).filter(
          (x) => config.kinds.includes(x.kind) && config.ends.includes(x.end) && x.word !== previous?.word,
        ),
        random,
      );
      return {
        ...item,
        stem: item.word.slice(0, -1),
        key: item.word,
        picture: config.picture !== false,
        answer: item.end,
        choices: shuffle([item.end, SOUND_TWINS[item.end]], random),
        speech: item.word,
        explain: {
          text: `${item.word} – ${item.long}: Beim Verlängern hört man das ${item.end}.`,
          speech: [`${item.word}. Verlängert: ${item.long}. Da hört man es:`, { laut: item.end.toUpperCase() }],
        },
        cue: `Wort: „${item.word}“ – verlängert: „${item.long}“`,
      };
    }
    if (mode === "count") {
      let question;
      do {
        let number;
        let answer;
        let forced = [];
        let explain;
        const extra = {};
        if (config.show === "dice") {
          const dice = [between(1, 6, random), between(1, 6, random)];
          number = answer = dice[0] + dice[1];
          extra.dice = dice;
          explain = sumExplain(dice[0], dice[1], number);
        } else if (config.show === "missing") {
          number = between(8, 19, random);
          answer = 20 - number;
          forced = [number];
          extra.frames = 2;
          explain = sumExplain(number, answer, 20);
        } else {
          number = answer =
            config.show === "frame"
              ? config.max === 10
                ? between(3, 10, random)
                : between(11, 20, random)
              : between(6, config.max, random);
          if (config.show === "frame") {
            extra.frames = config.max / 10;
            explain =
              number > 10
                ? sumExplain(10, number - 10, number)
                : number > 5
                  ? sumExplain(5, number - 5, number)
                  : { text: `Es sind ${number}.`, speech: `Es sind ${numberWord(number)}.` };
          }
          if (config.show === "tally") {
            const bundles = Math.floor(number / 5);
            const rest = number % 5;
            // Typical slip: every bundle counted as one stroke.
            forced = [bundles + rest];
            explain = rest
              ? {
                  text: `${bundles} Fünferbündel und ${rest} ${rest === 1 ? "einzelner Strich" : "einzelne Striche"}: ${number}.`,
                  speech: `${capitalize(countWord(bundles))} Fünferbündel und ${rest === 1 ? "ein einzelner Strich" : `${numberWord(rest)} einzelne Striche`} sind ${numberWord(number)}.`,
                }
              : {
                  text: `${bundles} Fünferbündel: ${number}.`,
                  speech: `${capitalize(countWord(bundles))} Fünferbündel sind ${numberWord(number)}.`,
                };
          }
          if (config.show === "scatter") {
            // Random spots on a 6×4 grid, a little shaken, never on top of each other.
            extra.points = shuffle([...Array(24).keys()], random)
              .slice(0, number)
              .map((cell) => ({
                x: Math.round((((cell % 6) + 0.5 + (random() - 0.5) * 0.5) / 6) * 1000) / 10,
                y: Math.round(((Math.floor(cell / 6) + 0.5 + (random() - 0.5) * 0.5) / 4) * 1000) / 10,
              }));
            explain = { text: `Es sind ${number}.`, speech: `Es sind ${numberWord(number)}.` };
          }
        }
        question = {
          show: config.show,
          icon: pick(SET_ICONS, random),
          number,
          answer: String(answer),
          ...extra,
          choices: numberOptions(
            answer,
            forced,
            [answer + 1, answer - 1, answer + 2, answer - 2, answer + 5, answer - 5],
            config.choices,
            random,
          ),
          explain,
        };
      } while (question.answer === previous?.answer);
      return question;
    }
    if (mode === "more") {
      const kind = pick(config.ask, random);
      let left;
      let right;
      if (config.equal && kind !== "diff" && random() < 0.2)
        left = right = between(2, config.max, random);
      else
        do [left, right] = [between(1, config.max, random), between(1, config.max, random)];
        while (left === right || Math.abs(left - right) < config.gap);
      const bigger = left > right ? "links" : left < right ? "rechts" : "gleich";
      const smaller = { links: "rechts", rechts: "links", gleich: "gleich" }[bigger];
      const diff = Math.abs(left - right);
      const answer = kind === "more" ? bigger : kind === "fewer" ? smaller : String(diff);
      const side = capitalize(bigger);
      return {
        kind,
        left,
        right,
        bigger,
        key: `${left}|${right}|${kind}`,
        icon: pick(SET_ICONS, random),
        // Fewer things drawn bigger: the number decides, not the size.
        bigSide: config.trap ? (smaller === "gleich" ? pick(["links", "rechts"], random) : smaller) : null,
        answer,
        choices:
          kind === "diff"
            ? numberOptions(diff, [Math.max(left, right)], [diff + 1, diff - 1, diff + 2, Math.min(left, right)], config.choices, random)
            : config.equal
              ? ["links", "gleich", "rechts"]
              : ["links", "rechts"],
        explain:
          kind === "diff"
            ? {
                text: `${Math.max(left, right)} − ${Math.min(left, right)} = ${diff}. ${side} sind ${diff} mehr.`,
                speech: `${capitalize(numberWord(Math.max(left, right)))} minus ${numberWord(Math.min(left, right))} ist ${numberWord(diff)}. ${side} sind ${numberWord(diff)} mehr.`,
              }
            : {
                text: `Links ${left}, rechts ${right}. ${bigger === "gleich" ? "Gleich viele." : `${capitalize(kind === "more" ? bigger : smaller)} sind ${kind === "more" ? "mehr" : "weniger"}.`}`,
                speech: `Links ${numberWord(left)}, rechts ${numberWord(right)}. ${bigger === "gleich" ? "Gleich viele." : `${capitalize(kind === "more" ? bigger : smaller)} sind ${kind === "more" ? "mehr" : "weniger"}.`}`,
              },
      };
    }
    if (mode === "venn") {
      const set = VENN_SETS[pick(config.sets, random)];
      const [ringA, ringB] = set.rings;
      const one = config.rings === 1;
      const items = set.items.map(([icon, article, word, a, b]) => {
        const zone = one ? (a ? "a" : "none") : a && b ? "both" : a ? "a" : b ? "b" : "none";
        return { icon, article, word, a: Boolean(a), b: Boolean(b), zone };
      });
      const rings = one ? [ringA] : [ringA, ringB];
      if (!config.ask) {
        const pool = config.noBoth ? items.filter((x) => x.zone !== "both") : items;
        const item = pick(
          pool.filter((x) => x.word !== previous?.item?.word),
          random,
        );
        // A few things already sorted show how the diagram works.
        const placed = shuffle(
          pool.filter((x) => x !== item),
          random,
        ).slice(0, 4);
        const facts = rings.map((ring, i) => ([item.a, item.b][i] ? ring.yes : ring.no));
        const sentence = `${capitalize(item.article)} ${item.word} ${facts.join(" und ")}.`;
        return {
          ask: "place",
          rings,
          item,
          placed,
          key: `${ringA.label}|${item.word}`,
          answer: item.zone,
          choices: one ? ["a", "none"] : ["a", "both", "b", "none"],
          explain: { text: `${item.icon} ${sentence}`, speech: sentence },
        };
      }
      // Counting in a filled diagram; every region holds at least one thing.
      let placed;
      do placed = shuffle(items, random).slice(0, between(7, 10, random));
      while (["a", "b", "both", "none"].some((zone) => !placed.some((x) => x.zone === zone)));
      const kind = pick(config.ask, random);
      const ringIndex = between(0, 1, random);
      const ring = rings[ringIndex];
      const inRing = (x) => (ringIndex === 0 ? x.a : x.b);
      let answer;
      let text;
      let forced = [];
      if (kind === "ring") {
        answer = placed.filter(inRing).length;
        // Typical slip: forgetting the things in the middle.
        forced = [placed.filter((x) => inRing(x) && x.zone !== "both").length];
        text = `Wie viele Dinge sind im Kreis „${ring.label}“?`;
      } else if (kind === "only") {
        answer = placed.filter((x) => inRing(x) && x.zone !== "both").length;
        forced = [placed.filter(inRing).length];
        text = `Wie viele Dinge sind nur im Kreis „${ring.label}“?`;
      } else if (kind === "both") {
        answer = placed.filter((x) => x.zone === "both").length;
        text = "Wie viele Dinge sind in beiden Kreisen?";
      } else {
        answer = placed.filter((x) => x.zone === "none").length;
        text = "Wie viele Dinge sind in keinem Kreis?";
      }
      const where = {
        ring: `im Kreis „${ring.label}“`,
        only: `nur im Kreis „${ring.label}“`,
        both: "in beiden Kreisen",
        none: "in keinem Kreis",
      }[kind];
      return {
        ask: kind,
        rings,
        ring: ringIndex,
        placed,
        question: text,
        key: `${ringA.label}|${placed.map((x) => x.word).join()}|${kind}|${ringIndex}`,
        answer: String(answer),
        choices: numberOptions(answer, forced, [answer + 1, answer - 1, answer + 2], config.choices, random),
        explain: {
          text: `${capitalize(where)} sind ${answer} ${answer === 1 ? "Ding" : "Dinge"}.`,
          speech: `${capitalize(where)} sind ${numberWord(answer)} ${answer === 1 ? "Ding" : "Dinge"}.`,
        },
      };
    }
    if (mode === "graph") {
      let question;
      do {
        const topic = pick(GRAPH_TOPICS, random);
        const values = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], random).slice(0, config.bars);
        const bars = shuffle(topic.items, random)
          .slice(0, config.bars)
          .map((item, i) => ({ ...item, value: values[i] }));
        const kind = pick(config.ask, random);
        const sorted = [...bars].sort((x, y) => y.value - x.value);
        const total = values.reduce((sum, x) => sum + x, 0);
        let answer;
        let text;
        let choices;
        let target = null;
        let pair = null;
        let explain;
        if (kind === "most" || kind === "least") {
          const bar = kind === "most" ? sorted[0] : sorted.at(-1);
          answer = bar.word;
          text = `Was mögen die ${kind === "most" ? "meisten" : "wenigsten"} Kinder am liebsten?`;
          choices = bars.map(({ word, icon }) => ({ word, icon }));
          explain = {
            text: `${bar.icon} ${bar.word}: ${bar.value} ${bar.value === 1 ? "Kind" : "Kinder"}.`,
            speech: `${bar.word}: ${countWord(bar.value)} ${bar.value === 1 ? "Kind" : "Kinder"}.`,
          };
        } else if (kind === "value") {
          target = between(0, bars.length - 1, random);
          const bar = bars[target];
          answer = String(bar.value);
          text = `Wie viele Kinder mögen ${bar.plural} am liebsten?`;
          choices = numberOptions(
            bar.value,
            [],
            [bar.value + 1, bar.value - 1, bar.value + 2, bar.value - 2],
            config.choices,
            random,
          );
          explain = {
            text: `${bar.value} ${bar.value === 1 ? "Kind mag" : "Kinder mögen"} ${bar.plural} am liebsten.`,
            speech: `${capitalize(countWord(bar.value))} ${bar.value === 1 ? "Kind mag" : "Kinder mögen"} ${bar.plural} am liebsten.`,
          };
        } else if (kind === "diff") {
          const [high, low] = shuffle(bars, random)
            .slice(0, 2)
            .sort((x, y) => y.value - x.value);
          pair = [bars.indexOf(high), bars.indexOf(low)];
          const diff = high.value - low.value;
          answer = String(diff);
          text = `Wie viele Kinder mehr mögen ${high.plural} als ${low.plural}?`;
          // Typical slip: reading one bar instead of the difference.
          choices = numberOptions(diff, [high.value], [diff + 1, diff - 1, low.value, diff + 2], config.choices, random);
          explain = sumExplain(high.value, -low.value, diff);
        } else {
          answer = String(total);
          text = "Wie viele Kinder sind es zusammen?";
          choices = numberOptions(total, [], [total + 1, total - 1, total + 2, total - 2, total + 10], config.choices, random);
          explain = {
            text: `${values.join(" + ")} = ${total}.`,
            speech: `Zusammen sind es ${numberWord(total)} Kinder.`,
          };
        }
        question = {
          kind,
          topic: topic.title,
          bars,
          target,
          pair,
          question: text,
          answer,
          choices,
          explain,
        };
      } while (question.answer === previous?.answer);
      return question;
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
      settings: { voice: "", rate: 0.8, speech: true, autoSpeak: true, lowercase: false },
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
      for (const key of ["speech", "autoSpeak", "lowercase"])
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
  const AREAS = CATEGORIES.map(({ id, report, games }) => ({ id, title: report, games }));
  function defaultStats() {
    return { games: {}, sounds: {}, abc: {}, merk: {}, math: { swaps: 0 }, days: {} };
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
    stats.math.swaps = count(raw.math?.swaps);
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
   * [[asked, chosen], …], swaps: picks with tens and ones swapped }.
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
    // Swapped tens and ones (74 for 47) are counted across all math games.
    if (MATH_GAMES.includes(task.mode) && task.swaps > 0) {
      const math = (stats.math ||= { swaps: 0 });
      math.swaps = Math.min(math.swaps + task.swaps, 1000000);
    }
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
      "Wörter in Silben klatschen, am Wortende verlängern (Hund – Hunde) und Merkwörter auf Kärtchen schreiben, den besonderen Buchstaben farbig markieren und täglich einmal gemeinsam lesen.",
    times: "Einmaleins im Alltag: Eierkartons (2 · 5), Hände (5er) und Socken (2er) zählen. Erst die Kernaufgaben 2 ·, 5 ·, 10 · sicher können, dann von dort aus weiterrechnen.",
    sizes: "Mit echtem Geld einkaufen spielen und gemeinsam auf die Uhr schauen: „Es ist halb vier – in einer halben Stunde ist es vier Uhr.“",
    memory:
      "Merkspiele im Alltag: Einkaufsliste mit 3–4 Dingen merken, „Ich packe meinen Koffer“ spielen.",
    tens: "Zehner bündeln mit Alltagsdingen: je 10 Nudeln in einen Becher, die übrigen einzeln daneben. Dann gemeinsam sagen: „4 Zehner und 7 Einer sind 47.“",
    space: "Zahlen verorten: auf einem Maßband oder Lineal zeigen lassen („Wo ist 37?“), eine Hundertertafel ausdrucken und Wege gehen – nach rechts 1 mehr, nach unten 10 mehr.",
    compare: "Vergleichen im Alltag: Hausnummern, Preise oder Seitenzahlen – „Welche ist größer? Schau zuerst auf die Zehner.“ Das Krokodil frisst immer die größere Zahl.",
    calc: "Mit Zehnern rechnen: 10-Cent-Münzen oder Zehnerstangen legen. Bei 52 + 30 bleiben die Einer gleich, nur die Zehner ändern sich.",
    sets: "Mengen im Alltag: Besteck oder Murmeln zählen, Paare bilden („Wer hat mehr?“), eine Strichliste führen und Spielzeug nach zwei Merkmalen sortieren – z. B. rot und rund. Was gehört in beide Gruppen?",
    charts: "Selbst ein Diagramm machen: Wer mag welches Obst? Für jedes Kind ein Kästchen ausmalen, dann fragen: Was mögen die meisten? Wie viele mehr?",
  };
  const SWAP_TIP =
    "Gegen Zahlendreher: Beim Sprechen kommen die Einer zuerst („sieben-und-vierzig“), geschrieben wird aber der Zehner zuerst. Zahlen gemeinsam legen und dabei erst die Zehner, dann die Einer aufschreiben.";
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
    const mathTasks = games
      .filter((game) => MATH_GAMES.includes(game.id))
      .reduce((total, game) => total + game.tasks, 0);
    const math = { tasks: mathTasks, swaps: stats.math?.swaps || 0 };
    if (math.swaps >= 2) {
      focus.push(`Zahlendreher: ${math.swaps}× Zehner und Einer vertauscht (z. B. 74 statt 47).`);
      tips.push(SWAP_TIP);
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
      math,
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
    SUBJECTS,
    CATEGORIES,
    MATH_GAMES,
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
    GRAPH_TOPICS,
    VENN_SETS,
    SYLLABLE_WORDS,
    EXTEND_WORDS,
    categoryOf,
    numberWord,
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
