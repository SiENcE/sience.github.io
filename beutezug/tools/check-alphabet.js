/* Prueft das Emoji-Alphabet: passt jeder Name zu seinem Buchstaben,
 * und steht kein Emoji fuer zwei verschiedene Buchstaben? */
global.window = {};
require('../js/emoji.js');

const A = window.EmojiAlphabet.ALPHABET;
const problems = [];
const seen = new Map();

for (const letter of Object.keys(A)) {
  const bucket = A[letter];
  if (!bucket.length) problems.push(`${letter}: leer`);
  for (const [emoji, name] of bucket) {
    if (name[0].toUpperCase() !== letter) {
      problems.push(`${letter}: "${name}" beginnt nicht mit ${letter}`);
    }
    if (seen.has(emoji)) {
      problems.push(`${emoji} doppelt: ${seen.get(emoji)} und ${letter}/${name}`);
    } else {
      seen.set(emoji, `${letter}/${name}`);
    }
  }
}

const counts = Object.keys(A)
  .map((l) => `${l}:${A[l].length}`)
  .join(' ');
console.log(counts);
console.log(`Buchstaben: ${Object.keys(A).length}  Emojis: ${seen.size}`);
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Alphabet ist sauber.');
process.exit(problems.length ? 1 : 0);
