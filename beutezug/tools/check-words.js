/* Prueft die Woerterbuecher und die Stufenleiter: nur A-Z, keine
 * Dubletten, und jeder der hundert Auftraege bekommt aus seinem Thema
 * genau so viele Worte, wie seine Sprosse verlangt -- in jeder Sprache
 * und in beiden Modi. Ein Thema, das auf Stufe 80 keine acht langen
 * Worte mehr hergibt, faellt hier auf und nicht erst beim Spielen. */
global.window = {};
require('../js/i18n.js');
require('../js/words.js');

const W = window.Woerter;
const problems = [];
const hinweise = [];

for (const code of Object.keys(W.SPRACHEN)) {
  const S = W.SPRACHEN[code];

  for (const wort of S.DICT) {
    if (!/^[A-Z]{3,}$/.test(wort)) problems.push(`${code}: ungueltig: "${wort}"`);
  }

  const pruefeThemen = (themen, art, maxLaenge) => {
    for (const thema of themen) {
      const gesehen = new Set();
      for (const wort of thema.liste) {
        const wo = `${code} ${art} "${thema.titel}"`;
        if (!/^[A-Z]{3,}$/.test(wort)) problems.push(`${wo}: ungueltig: "${wort}"`);
        if (gesehen.has(wort)) problems.push(`${wo}: ${wort} doppelt`);
        if (wort.length > maxLaenge) problems.push(`${wo}: ${wort} ist laenger als ${maxLaenge}`);
        gesehen.add(wort);
      }
    }
  };
  pruefeThemen(S.THEMEN, 'Thema', 8);
  pruefeThemen(S.KINDERTHEMEN, 'Kinderthema', 6);

  const pruefeAuftraege = (liste, art) => {
    liste.forEach((lvl, i) => {
      const wo = `${code} ${art} ${i + 1} "${lvl.titel}"`;
      const flaeche = lvl.spalten * lvl.zeilen;
      const buchstaben = lvl.worte.reduce((a, w) => a + w.length, 0);
      if (buchstaben > flaeche * 0.7) {
        problems.push(`${wo}: ${buchstaben} Buchstaben auf ${flaeche} Felder ist eng`);
      }
      if (lvl.worte.length !== lvl.anzahl) {
        problems.push(`${wo}: ${lvl.worte.length} statt ${lvl.anzahl} Worte`);
      }
      if (new Set(lvl.worte).size !== lvl.worte.length) problems.push(`${wo}: Wort doppelt`);
      for (const wort of lvl.worte) {
        if (!S.DICT.has(wort)) problems.push(`${wo}: ${wort} fehlt im Woerterbuch`);
        if (wort.length > lvl.spalten) {
          problems.push(`${wo}: ${wort} (${wort.length}) ist breiter als ${lvl.spalten} Spalten`);
        }
        for (const anderes of lvl.worte) {
          if (anderes !== wort && anderes.indexOf(wort) !== -1) {
            problems.push(`${wo}: ${wort} steckt in ${anderes}`);
          }
        }
        /* Ein erweitertes Laengenfenster ist erlaubt, soll aber gesehen
         * werden: es heisst, dem Thema fehlen Worte dieser Laenge. */
        if (wort.length < lvl.laenge[0] || wort.length > lvl.laenge[1]) {
          hinweise.push(`${wo}: ${wort} liegt ausserhalb ${lvl.laenge.join('-')}`);
        }
      }
      if (lvl.verdeckt.some((w) => lvl.worte.indexOf(w) === -1)) {
        problems.push(`${wo}: verdeckt ein Wort, das nicht gesucht wird`);
      }
      if (lvl.neu && !window.Sprache.TEXTE.de['neu-' + lvl.neu]) {
        problems.push(`${wo}: Neuerung "${lvl.neu}" hat keinen Text`);
      }
    });
  };

  pruefeAuftraege(S.LEVELS, 'Level');
  pruefeAuftraege(S.KINDER, 'Kind');

  const nachLaenge = {};
  for (const w of S.DICT) nachLaenge[w.length] = (nachLaenge[w.length] || 0) + 1;

  console.log(`[${code}] Woerter gesamt: ${S.DICT.size}`);
  console.log(`[${code}] nach Laenge: ` + Object.keys(nachLaenge)
    .sort((a, b) => a - b).map((k) => `${k}:${nachLaenge[k]}`).join(' '));
  console.log(`[${code}] Themen: ${S.THEMEN.length}, Kinderthemen: ${S.KINDERTHEMEN.length}`);
}

if (hinweise.length) console.log(`HINWEISE (${hinweise.length}):\n` + hinweise.join('\n'));
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Woerterbuecher und Stufen sind sauber.');
process.exit(problems.length ? 1 : 0);
