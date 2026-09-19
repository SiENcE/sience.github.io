/* Baut jeden Auftrag mehrfach und prueft, ob das Ergebnis spielbar ist:
 * liegen alle gesuchten Woerter wirklich als gueltiger Pfad im Brett,
 * und findet der Loeser sie auch wieder? */
global.window = {};
require('../js/emoji.js');
require('../js/words.js');
require('../js/board.js');

const { Brett, Woerter } = window;
const problems = [];
let gesamtLoesungen = 0;
let bretter = 0;
const start = Date.now();

function pruefePfad(brett, wort, pfad) {
  if (!pfad || pfad.length !== wort.length) return `${wort}: Pfadlaenge falsch`;
  const sp = brett.spalten;
  const gesehen = new Set();
  let richtung = null;

  for (let i = 0; i < pfad.length; i++) {
    if (gesehen.has(pfad[i])) return `${wort}: Feld ${pfad[i]} doppelt benutzt`;
    gesehen.add(pfad[i]);
    if (brett.buchstaben[pfad[i]] !== wort[i]) {
      return `${wort}: Feld ${i} traegt ${brett.buchstaben[pfad[i]]} statt ${wort[i]}`;
    }
    if (i > 0) {
      const dx = (pfad[i] % sp) - (pfad[i - 1] % sp);
      const dy = Math.floor(pfad[i] / sp) - Math.floor(pfad[i - 1] / sp);
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) {
        return `${wort}: Sprung zwischen Feld ${i - 1} und ${i}`;
      }
      // Worte muessen auf einer Geraden liegen, nicht nur zusammenhaengen.
      if (richtung && (richtung[0] !== dx || richtung[1] !== dy)) {
        return `${wort}: Knick bei Feld ${i} (${richtung} -> ${[dx, dy]})`;
      }
      richtung = [dx, dy];
    }
  }
  return null;
}

for (let nummer = 0; nummer < 12; nummer++) {
  const auftrag = Woerter.level(nummer);
  for (let saat = 1; saat <= 6; saat++) {
    const brett = Brett.baue(auftrag, saat);
    bretter++;
    if (!brett) {
      problems.push(`Level ${nummer} "${auftrag.titel}" Saat ${saat}: kein Brett gebaut`);
      continue;
    }
    if (brett.buchstaben.some((b) => b === null || !/^[A-Z]$/.test(b))) {
      problems.push(`Level ${nummer} Saat ${saat}: leere oder ungueltige Felder`);
    }
    if (brett.kacheln.some((k) => !k || !k.emoji)) {
      problems.push(`Level ${nummer} Saat ${saat}: Kachel ohne Emoji`);
    }
    for (const wort of auftrag.worte) {
      const fehler = pruefePfad(brett, wort, brett.pfade[wort]);
      if (fehler) problems.push(`Level ${nummer} Saat ${saat}: ${fehler}`);
    }
    const loesungen = Brett.alleLoesungen(brett, Woerter.DICT);
    gesamtLoesungen += loesungen.size;
    for (const wort of auftrag.worte) {
      if (!loesungen.has(wort)) {
        problems.push(`Level ${nummer} Saat ${saat}: Loeser findet ${wort} nicht`);
      }
    }
    if (saat === 1) {
      console.log(
        `${String(nummer).padStart(2)} ${auftrag.titel.padEnd(18)} ` +
        `${auftrag.spalten}x${auftrag.zeilen}  Ziele: ${auftrag.worte.length}  ` +
        `Loesungen: ${loesungen.size}`
      );
    }
  }
}

/* Kindermodus: dieselben Pruefungen, plus die beiden Zusagen, auf denen
 * der Modus beruht -- jedes Wort liegt waagerecht von links nach rechts,
 * und es passt ueberhaupt in die Brettbreite. */
console.log('\nKindermodus:');
for (let nummer = 0; nummer < 13; nummer++) {
  const auftrag = Woerter.level(nummer, true);

  for (const wort of auftrag.worte) {
    if (!Woerter.DICT.has(wort)) {
      problems.push(`Kind ${nummer}: ${wort} fehlt im Woerterbuch`);
    }
    if (wort.length > auftrag.spalten) {
      problems.push(`Kind ${nummer}: ${wort} (${wort.length}) passt nicht in ${auftrag.spalten} Spalten`);
    }
  }

  for (let saat = 1; saat <= 6; saat++) {
    const brett = Brett.baue(auftrag, saat);
    bretter++;
    if (!brett) {
      problems.push(`Kind ${nummer} Saat ${saat}: kein Brett gebaut`);
      continue;
    }
    gesamtLoesungen += Brett.alleLoesungen(brett, Woerter.DICT).size;

    for (const wort of auftrag.worte) {
      const pfad = brett.pfade[wort];
      const fehler = pruefePfad(brett, wort, pfad);
      if (fehler) problems.push(`Kind ${nummer} Saat ${saat}: ${fehler}`);

      for (let i = 1; i < pfad.length; i++) {
        if (pfad[i] - pfad[i - 1] !== 1) {
          problems.push(`Kind ${nummer}: ${wort} laeuft nicht links nach rechts`);
          break;
        }
      }
      const zeileA = Math.floor(pfad[0] / brett.spalten);
      const zeileB = Math.floor(pfad[pfad.length - 1] / brett.spalten);
      if (zeileA !== zeileB) {
        problems.push(`Kind ${nummer}: ${wort} laeuft ueber den Zeilenrand`);
      }
    }
  }

  console.log(
    `${String(nummer).padStart(2)} ${auftrag.titel.padEnd(18)} ` +
    `${auftrag.spalten}x${auftrag.zeilen}  Worte: ${auftrag.worte.length}  ` +
    `ohne Bild: ${Math.round(auftrag.buchstabenAnteil * 100)}%`
  );
}

console.log(`\n${bretter} Bretter in ${Date.now() - start} ms, ` +
  `im Schnitt ${Math.round(gesamtLoesungen / bretter)} Loesungen pro Brett`);
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Alle Bretter sind spielbar.');
process.exit(problems.length ? 1 : 0);
