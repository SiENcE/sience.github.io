/* Prueft das Woerterbuch: nur A-Z, keine Dubletten, und jedes Wort aus
 * dem Gewinnplan eines Auftrags steht auch wirklich drin. */
global.window = {};
require('../js/words.js');

const W = window.Woerter;
const problems = [];

for (const wort of W.DICT) {
  if (!/^[A-Z]{3,}$/.test(wort)) problems.push(`ungueltig: "${wort}"`);
}

W.LEVELS.forEach((lvl, i) => {
  const flaeche = lvl.spalten * lvl.zeilen;
  const buchstaben = lvl.worte.reduce((a, w) => a + w.length, 0);
  if (buchstaben > flaeche * 0.7) {
    problems.push(`Level ${i} "${lvl.titel}": ${buchstaben} Buchstaben auf ${flaeche} Felder ist eng`);
  }
  for (const wort of lvl.worte) {
    if (!W.DICT.has(wort)) problems.push(`Level ${i} "${lvl.titel}": ${wort} fehlt im Woerterbuch`);
    if (wort.length > Math.max(lvl.spalten, lvl.zeilen)) {
      // Schlangenpfade duerfen sich biegen, das ist also nur ein Hinweis.
      console.log(`  hinweis: ${wort} (${wort.length}) ist laenger als eine Brettkante`);
    }
  }
});

const nachLaenge = {};
for (const w of W.DICT) nachLaenge[w.length] = (nachLaenge[w.length] || 0) + 1;

console.log('Woerter gesamt:', W.DICT.size);
console.log('nach Laenge:', Object.keys(nachLaenge).sort((a, b) => a - b)
  .map((k) => `${k}:${nachLaenge[k]}`).join(' '));
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Woerterbuch ist sauber.');
process.exit(problems.length ? 1 : 0);
