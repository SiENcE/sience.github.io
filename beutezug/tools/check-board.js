/* Baut jeden Auftrag der Stufenleiter mehrfach und prueft, ob das
 * Ergebnis spielbar ist: liegen alle gesuchten Woerter wirklich als
 * gueltiger Pfad im Brett, findet der Loeser sie auch wieder, und haelt
 * das Brett, was die Sprosse verspricht -- keine Kreuzung, wo sie noch
 * verboten ist, die neue Richtung, wo sie angekuendigt wird, und fuer
 * Kinder nur Worte, die vorwaerts gelesen werden. Und zwar in jeder
 * Sprache: jede bringt eigene Themen, ein eigenes Alphabet und eine
 * eigene Buchstabenhaeufigkeit fuer die Fuellkacheln mit. */
global.window = {};
require('../js/i18n.js');
require('../js/emoji.js');
require('../js/words.js');
require('../js/board.js');

const { Brett, Woerter, Sprache } = window;
const problems = [];
const SAATEN = 6;
/* Ein paar Auftraege hinter der letzten Stufe: auch der Endlosbetrieb
 * muss bauen koennen. */
const BIS = Woerter.STUFEN + 5;
let gesamtLoesungen = 0;
let bretter = 0;
const start = Date.now();

function richtungVon(brett, pfad) {
  const sp = brett.spalten;
  const dx = (pfad[1] % sp) - (pfad[0] % sp);
  const dy = Math.floor(pfad[1] / sp) - Math.floor(pfad[0] / sp);
  return Brett.RICHTUNGEN.findIndex((r) => r[0] === dx && r[1] === dy);
}

const RICHTUNGSNAMEN = ['rechts', 'rechtsrunter', 'runter', 'linksrunter',
  'links', 'linksrauf', 'rauf', 'rechtsrauf'];

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

function pruefeAuftrag(code, art, nummer, auftrag) {
  const wo = `${code} ${art} ${nummer + 1}`;
  for (let saat = 1; saat <= SAATEN; saat++) {
    const brett = Brett.baue(auftrag, saat);
    bretter++;
    if (!brett) {
      problems.push(`${wo} "${auftrag.titel}" Saat ${saat}: kein Brett gebaut`);
      continue;
    }
    if (brett.buchstaben.some((b) => b === null || !/^[A-Z]$/.test(b))) {
      problems.push(`${wo} Saat ${saat}: leere oder ungueltige Felder`);
    }
    if (brett.kacheln.some((k) => !k || !k.emoji)) {
      problems.push(`${wo} Saat ${saat}: Kachel ohne Emoji`);
    }

    const belegt = new Map();
    for (const wort of auftrag.worte) {
      const pfad = brett.pfade[wort];
      const fehler = pruefePfad(brett, wort, pfad);
      if (fehler) {
        problems.push(`${wo} Saat ${saat}: ${fehler}`);
        continue;
      }

      const r = RICHTUNGSNAMEN[richtungVon(brett, pfad)];
      if (auftrag.richtungen.indexOf(r) === -1) {
        problems.push(`${wo} Saat ${saat}: ${wort} liegt ${r}, erlaubt ist ${auftrag.richtungen}`);
      }

      let eigene = 0;
      for (const feld of pfad) {
        if (belegt.has(feld)) {
          if (auftrag.kreuzen === false) {
            problems.push(`${wo} Saat ${saat}: ${wort} kreuzt ${belegt.get(feld)}, obwohl verboten`);
          }
        } else {
          eigene++;
        }
      }
      for (const feld of pfad) if (!belegt.has(feld)) belegt.set(feld, wort);
      if (!eigene) problems.push(`${wo} Saat ${saat}: ${wort} liegt ganz auf anderen Worten`);
    }

    /* Eine angekuendigte Richtung muss auf dem Brett auch vorkommen. */
    if (auftrag.neueRichtung) {
      const kommtVor = auftrag.worte.some((w) =>
        brett.pfade[w] && RICHTUNGSNAMEN[richtungVon(brett, brett.pfade[w])] === auftrag.neueRichtung);
      if (!kommtVor) {
        problems.push(`${wo} Saat ${saat}: neue Richtung ${auftrag.neueRichtung} kommt nicht vor`);
      }
    }

    const loesungen = Brett.alleLoesungen(brett, Woerter.DICT);
    gesamtLoesungen += loesungen.size;
    for (const wort of auftrag.worte) {
      if (!loesungen.has(wort)) {
        problems.push(`${wo} Saat ${saat}: Loeser findet ${wort} nicht`);
      }
    }
  }
}

for (const code of Sprache.CODES) {
  Sprache.setze(code);
  console.log(`\n=== ${code} ===`);

  for (const [art, leicht] of [['Level', false], ['Kind', true]]) {
    console.log(art === 'Kind' ? 'Kindermodus:' : 'Erwachsene:');
    for (let nummer = 0; nummer < BIS; nummer++) {
      const auftrag = Woerter.level(nummer, leicht);

      /* Kinder lesen vorwaerts: von links nach rechts, spaeter auch von
       * oben nach unten -- nie rueckwaerts, nie schraeg. */
      if (leicht && auftrag.richtungen.some((r) => r !== 'rechts' && r !== 'runter')) {
        problems.push(`${code} Kind ${nummer + 1}: Richtung ${auftrag.richtungen} ist nicht vorwaerts`);
      }
      if (leicht && auftrag.verdeckt.length) {
        problems.push(`${code} Kind ${nummer + 1}: verdeckte Worte im Kindermodus`);
      }

      pruefeAuftrag(code, art, nummer, auftrag);

      if (auftrag.neu || nummer === 0 || nummer === BIS - 1) {
        console.log(
          `${String(nummer + 1).padStart(3)} ${auftrag.titel.padEnd(19)} ` +
          `${auftrag.spalten}x${auftrag.zeilen}  Worte: ${auftrag.worte.length}  ` +
          (leicht ? `ohne Bild: ${Math.round(auftrag.buchstabenAnteil * 100)}%  ` : '') +
          `${auftrag.neu ? 'NEU: ' + auftrag.neu : ''}`
        );
      }
    }
  }
}

console.log(`\n${bretter} Bretter in ${Date.now() - start} ms, ` +
  `im Schnitt ${Math.round(gesamtLoesungen / bretter)} Loesungen pro Brett`);
console.log(problems.length ? 'PROBLEME:\n' + problems.slice(0, 60).join('\n') +
  (problems.length > 60 ? `\n... und ${problems.length - 60} weitere` : '')
  : 'Alle Bretter sind spielbar.');
process.exit(problems.length ? 1 : 0);
