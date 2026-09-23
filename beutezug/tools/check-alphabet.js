/* Prueft die Emoji-Alphabete: passt jeder Name zu seinem Buchstaben,
 * und steht kein Emoji fuer zwei verschiedene Buchstaben? Gepruefft wird
 * jede Sprache fuer sich -- dasselbe Bild darf in einer anderen Sprache
 * durchaus einen anderen Buchstaben tragen (CAT ist ein C, KATZE ein K),
 * nur innerhalb einer Sprache nie zwei. */
global.window = {};
require('../js/i18n.js');
require('../js/emoji.js');

const ALPHABETE = window.EmojiAlphabet.ALPHABETE;
const GEWICHTE = window.EmojiAlphabet.GEWICHTE;
const problems = [];
const bilder = {};

for (const code of Object.keys(ALPHABETE)) {
  const A = ALPHABETE[code];
  const seen = new Map();

  for (const letter of Object.keys(A)) {
    const bucket = A[letter];
    if (!bucket.length) problems.push(`${code}/${letter}: leer`);
    for (const [emoji, name] of bucket) {
      if (name[0].toUpperCase() !== letter) {
        problems.push(`${code}/${letter}: "${name}" beginnt nicht mit ${letter}`);
      }
      if (seen.has(emoji)) {
        problems.push(`${code}: ${emoji} doppelt: ${seen.get(emoji)} und ${letter}/${name}`);
      } else {
        seen.set(emoji, `${letter}/${name}`);
      }
      (bilder[emoji] = bilder[emoji] || []).push(code);
    }
  }

  const fehlend = Object.keys(A).filter((l) => GEWICHTE[code][l] === undefined);
  if (fehlend.length) {
    problems.push(`${code}: keine Haeufigkeit fuer ${fehlend.join(' ')}`);
  }

  const counts = Object.keys(A).map((l) => `${l}:${A[l].length}`).join(' ');
  console.log(`[${code}] ${counts}`);
  console.log(`[${code}] Buchstaben: ${Object.keys(A).length}  Emojis: ${seen.size}`);
}

/* Kein Fehler, nur wissenswert: Bilder, die es in einer Sprache nicht
 * gibt. UMBRELLA traegt erst im Englischen einen Buchstaben, der sonst
 * leer bliebe -- im Deutschen ist der Regenschirm ein R unter vielen. */
const codes = Object.keys(ALPHABETE);
const nurEine = Object.keys(bilder).filter((e) => bilder[e].length < codes.length);
if (nurEine.length) {
  console.log('nur in einer Sprache: ' +
    nurEine.map((e) => `${e}(${bilder[e].join(',')})`).join(' '));
}

console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Alphabete sind sauber.');
process.exit(problems.length ? 1 : 0);
