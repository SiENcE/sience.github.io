/* Entfernt Eintraege, die es ohne Umlaut gar nicht gibt (BRUCKE statt
 * BRUECKE) oder die nur schwache Genitivformen sind. Einmalig gedacht,
 * aber idempotent -- zweimal laufen lassen schadet nicht. */
const fs = require('fs');
const path = require('path');

const RAUS = [
  // ohne Umlaut schlicht falsch geschrieben
  'BRUCKE', 'BUCHER', 'DACHER', 'DRAHTE', 'FACHER', 'FLUGEL', 'GEBAUDE',
  'GESANGE', 'GESPRACH', 'OFFNEN', 'PFLUGE', 'APFELN', 'STADTE', 'STUHLE',
  'TRAUME', 'VOGELN', 'BLATTE',
  // blasse Genitive, die kein Mensch sucht
  'ADLERS', 'AUGENS', 'BADENS', 'BODENS', 'BOGENS', 'FADENS', 'GARTENS',
  'HIMMELS', 'LADENS', 'WAGENS', 'HERBSTE', 'STRANDE', 'TITELN'
];

const file = path.join(__dirname, '..', 'js', 'words.js');
let src = fs.readFileSync(file, 'utf8');
let entfernt = [];

for (const wort of RAUS) {
  const re = new RegExp(`(?<=['\\s])${wort}(?=[\\s'])`, 'g');
  if (re.test(src)) {
    entfernt.push(wort);
    src = src.replace(new RegExp(`(?<=['\\s])${wort} `, 'g'), '');
    src = src.replace(new RegExp(` ${wort}(?=')`, 'g'), '');
  }
}

/* doppelte Leerzeichen innerhalb der Listen wieder einsammeln */
src = src.replace(/'([A-Z ]+)'/g, (m, inner) => `'${inner.replace(/ {2,}/g, ' ')}'`);

fs.writeFileSync(file, src, 'utf8');
console.log(`entfernt (${entfernt.length}): ${entfernt.join(' ') || '-'}`);
