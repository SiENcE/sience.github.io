/* Prueft die Sprachtabellen gegen sich selbst und gegen game.js.
 *
 * Eine fehlende Zeile faellt beim Spielen erst auf, wenn man genau den
 * Dialog oeffnet, in dem sie steht -- und dann steht dort der
 * Schluessel. Also wird hier verglichen: hat jede Sprache dieselben
 * Schluessel, dieselbe Form (Zeile oder Zeilenblock) und dieselben
 * Platzhalter, und benutzt game.js nur Schluessel, die es gibt?
 *
 * game.js selbst laesst sich unter Node nicht laden (es fasst beim Start
 * document an), also wird es als Text durchsucht. Das reicht: die
 * Aufrufe heissen ueberall text('...') und textZeilen('...').
 */
global.window = {};
require('../js/i18n.js');

const fs = require('fs');
const path = require('path');

const TEXTE = window.Sprache.TEXTE;
const CODES = window.Sprache.CODES;
const HEIMAT = CODES[0];
const problems = [];

function platzhalter(wert) {
  const text = Array.isArray(wert) ? wert.join(' ') : String(wert);
  return (text.match(/\{(\w+)\}/g) || []).sort().join(',');
}

function form(wert) {
  return Array.isArray(wert) ? 'zeilen' : 'zeile';
}

for (const code of CODES) {
  if (!TEXTE[code]) {
    problems.push(`${code}: keine Tabelle`);
    continue;
  }
  if (!window.Sprache.NAMEN[code]) problems.push(`${code}: kein Sprachname`);
}

const heimatSchluessel = Object.keys(TEXTE[HEIMAT]);

for (const code of CODES) {
  if (code === HEIMAT || !TEXTE[code]) continue;
  const fremd = TEXTE[code];

  for (const schluessel of heimatSchluessel) {
    if (fremd[schluessel] === undefined) {
      problems.push(`${code}: "${schluessel}" fehlt`);
      continue;
    }
    if (form(fremd[schluessel]) !== form(TEXTE[HEIMAT][schluessel])) {
      problems.push(`${code}: "${schluessel}" ist ${form(fremd[schluessel])}, ` +
        `${HEIMAT} hat ${form(TEXTE[HEIMAT][schluessel])}`);
    }
    const a = platzhalter(TEXTE[HEIMAT][schluessel]);
    const b = platzhalter(fremd[schluessel]);
    if (a !== b) {
      problems.push(`${code}: "${schluessel}" hat Platzhalter ${b || '(keine)'}, ` +
        `${HEIMAT} hat ${a || '(keine)'}`);
    }
  }

  for (const schluessel of Object.keys(fremd)) {
    if (TEXTE[HEIMAT][schluessel] === undefined) {
      problems.push(`${code}: "${schluessel}" kennt ${HEIMAT} nicht`);
    }
  }
}

/* Und nun die andere Richtung: was benutzt das Spiel? */
const quelle = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
const benutzt = new Set();
/* Nur ganze Schluessel -- text('neu-' + neu) setzt einen zusammen und
 * wird unten aus der Stufenleiter geprueft. */
const muster = /\btext(?:Zeilen)?\(\s*'([^']+)'\s*[,)]/g;
let treffer;
while ((treffer = muster.exec(quelle)) !== null) benutzt.add(treffer[1]);

for (const schluessel of benutzt) {
  if (TEXTE[HEIMAT][schluessel] === undefined) {
    problems.push(`game.js benutzt "${schluessel}", das es nicht gibt`);
  }
}

/* Die Ansagen der Stufenleiter setzt game.js aus 'neu-' und dem Namen
 * der Neuerung zusammen, der in words.js steht. Die findet die Suche
 * oben nicht -- also werden sie aus der Leiter selbst gelesen. */
require('../js/words.js');
const ausLeiter = new Set();
for (const code of Object.keys(window.Woerter.SPRACHEN)) {
  const s = window.Woerter.SPRACHEN[code];
  for (const lvl of s.LEVELS.concat(s.KINDER)) {
    if (!lvl.neu) continue;
    ausLeiter.add('neu-' + lvl.neu);
    ausLeiter.add('neu-' + lvl.neu + '-info');
  }
}
for (const schluessel of ausLeiter) {
  if (TEXTE[HEIMAT][schluessel] === undefined) {
    problems.push(`die Stufenleiter braucht "${schluessel}", das es nicht gibt`);
  }
}

/* Ungenutzte Schluessel sind kein Fehler -- ein Dialog kann sie morgen
 * brauchen --, aber sie wollen gesehen werden. Gesucht wird dafuer in
 * allen Zeichenketten der Datei, nicht nur in den Aufrufen: manche
 * Schluessel stehen in einer Bedingung ('ton-an' oder 'ton-aus') oder
 * in einer Liste von Bloecken, und die sind trotzdem in Gebrauch. */
const ungenutzt = heimatSchluessel.filter(
  (k) => quelle.indexOf("'" + k + "'") === -1 && !ausLeiter.has(k)
);

console.log(`Sprachen: ${CODES.join(' ')}  Schluessel: ${heimatSchluessel.length}`);
console.log(`in game.js benutzt: ${benutzt.size}`);
if (ungenutzt.length) console.log('ungenutzt: ' + ungenutzt.join(' '));
console.log(problems.length ? 'PROBLEME:\n' + problems.join('\n') : 'Sprachtabellen sind sauber.');
process.exit(problems.length ? 1 : 0);
