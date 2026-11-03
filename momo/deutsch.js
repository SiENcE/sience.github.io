/*
 * Views of the newer German games (syllables, lengthening words, spelling
 * detective, word types, tenses): task markup, stepped help and the revealed
 * answer, with the same interface as math.js. Rules and words come from
 * core.js; the flow stays in app.js.
 * The voice never gets a single letter: syllables have two letters or more,
 * endings are named only in the text or played as sounds, and spelling
 * choices (nn, ie, ß …) are only shown, never spoken.
 */
(function () {
  "use strict";
  const C = window.Wiese;
  const W = C.numberWord;
  const MODES = ["syllables", "extend", "spell", "wordtype", "tense"];
  const same = (text) => ({ text, speech: text });
  const capitalize = (text) => text[0].toUpperCase() + text.slice(1);
  // Probes that prove a word type ("der Hund", "ich laufe", "sehr groß").
  const PROBES = {
    Nomen: "Nomen: Passt der, die oder das davor?",
    Verb: "Verb: Passt ich, du oder er davor?",
    Adjektiv: "Adjektiv: Passt sehr davor?",
    Pronomen: "Pronomen: Steht es für eine Person oder ein Ding?",
    Artikel: "Artikel: Steht es direkt vor einem Nomen?",
  };

  function instruction(q) {
    if (q.mode === "syllables")
      return same(
        q.ask === "count"
          ? "Hör gut zu: Wie viele Silben hat das Wort?"
          : "Hör gut zu: Welche Silbe fehlt?",
      );
    if (q.mode === "spell")
      return q.sentence
        ? { text: "Hör gut zu: das oder dass?", speech: "Hör gut zu. Welches Wort fehlt im Satz?" }
        : same("Hör gut zu: Was fehlt im Wort?");
    if (q.mode === "wordtype")
      return same(q.sentence ? "Welche Wortart hat das markierte Wort?" : "Welche Wortart ist das Wort?");
    if (q.mode === "tense")
      return same(
        {
          past: "Es war gestern. Welches Wort passt?",
          part: "Es war gestern. Welches Wort passt in die Lücke?",
          aux: "Was passt: habe oder bin?",
          name: "Welche Zeitform ist das?",
        }[q.kind],
      );
    return same("Hör gut zu: Wie endet das Wort?");
  }

  function buttons(choices, cls, labels = {}) {
    return `<div class="answer-choices">${choices.map((choice) => `<button class="letter-button ${cls}" data-answer="${choice}" aria-label="${labels[choice] || choice}">${labels[choice] || choice}</button>`).join("")}</div>`;
  }
  const gapMark = '<span class="merk-gap" data-reveal>?</span>';
  function markup(q, listen) {
    const picture = `<div class="word-picture${q.picture ? "" : " no-picture"}" id="word-picture" aria-hidden="true">${q.picture ? q.icon : "👂"}</div>`;
    if (q.mode === "syllables") {
      if (q.ask === "count")
        return `${picture}${listen("Wort anhören")}<div class="syllable-row" id="syllable-help" hidden>${q.syllables.map((syllable) => `<span class="syllable arc">${syllable}</span>`).join("")}</div>${buttons(q.choices, "number-button")}`;
      const row = q.syllables
        .map((syllable, i) =>
          i === q.gap
            ? '<span class="syllable arc gap" data-reveal>?</span>'
            : `<span class="syllable arc">${syllable}</span>`,
        )
        .join("");
      return `${picture}${listen("Wort anhören")}<div class="syllable-row" aria-label="Wort mit Lücke">${row}</div>${buttons(q.choices, "syllable-button")}`;
    }
    if (q.mode === "spell") {
      const help = '<p class="merk-tip" id="spell-help" hidden></p>';
      if (q.sentence)
        return `${listen("Satz anhören")}<p class="spell-sentence" aria-label="Satz mit Lücke">${q.before}${gapMark}${q.after}</p>${help}${buttons(q.choices, "merk-choice")}`;
      return `${picture}${listen("Wort anhören")}<div class="merk-word" aria-label="Wort mit Lücke">${q.before}${gapMark}${q.after}</div>${help}${buttons(q.choices, "merk-choice")}`;
    }
    if (q.mode === "wordtype") {
      const word = `<mark class="type-word">${q.shown}</mark>`;
      const help = `<ul class="type-help" id="type-help" hidden>${q.choices.map((x) => `<li>${PROBES[x]}</li>`).join("")}</ul>`;
      const task = q.sentence
        ? `${listen("Satz anhören")}<p class="type-sentence">${q.before}${word}${q.after}</p>`
        : `${q.picture ? `<div class="word-picture" id="word-picture" aria-hidden="true">${q.icon}</div>` : ""}${listen("Wort anhören")}<p class="type-single">${word}</p>`;
      return `${task}${help}${buttons(q.choices, "merk-choice type-button")}`;
    }
    if (q.mode === "tense") {
      const help = '<div class="merk-tip tense-help" id="tense-help" hidden></div>';
      if (q.kind === "name")
        return `${listen("Satz anhören")}<p class="tense-sentence">${q.sentence}</p>${help}${buttons(q.choices, "merk-choice tense-button", q.labels)}`;
      return `${listen("Sätze anhören")}<p class="tense-present">${q.present}</p><p class="tense-sentence">${q.before} ${gapMark}${q.after === "." ? "" : " "}${q.after}</p>${help}${buttons(q.choices, "merk-choice tense-button")}`;
    }
    return `${picture}${listen("Wort anhören")}<div class="merk-word" aria-label="Wort mit Lücke">${q.stem}<span class="merk-gap" data-reveal>?</span></div><p class="merk-tip" id="extend-help" hidden></p>${buttons(q.choices, "merk-choice")}`;
  }

  function reveal(q, root, value) {
    if (q.mode === "wordtype") {
      // Now the word shows in its real spelling (nouns with a capital).
      const word = root.querySelector(".type-word");
      word.textContent = q.word;
      word.classList.add("found");
      return;
    }
    const target = root.querySelector("[data-reveal]");
    if (!target) return;
    target.textContent = value;
    target.classList.add("found");
  }

  function namedPick(q, picked) {
    if (picked == null) return null;
    if (q.mode === "extend")
      return { text: `${picked} passt nicht.`, speech: "Dieser Buchstabe passt nicht." };
    // Spelling choices are letters: shown, never spoken.
    if (q.mode === "spell") return { text: `${picked} passt nicht.`, speech: "Das passt nicht." };
    if (q.mode === "tense")
      return q.kind === "name"
        ? { text: `${q.labels[picked]} passt nicht.`, speech: `${q.say[picked]} passt nicht.` }
        : { text: `„${picked}“ passt nicht.`, speech: "Das passt hier nicht." };
    if (/^\d+$/.test(picked))
      return { text: `${picked} passt nicht.`, speech: `${capitalize(W(Number(picked)))} passt nicht.` };
    return same(`${picked} passt nicht.`);
  }
  /*
   * Help in steps: first a tip, then Momo speaks the word in syllables (or
   * the lengthened word), and for counting the syllable arcs appear.
   */
  function hint(q, n, picked, root) {
    let tip;
    if (q.mode === "syllables") {
      if (n === 1)
        tip = same(
          q.ask === "count"
            ? "Sprich das Wort langsam und klatsche bei jeder Silbe."
            : "Sprich das Wort langsam in Silben.",
        );
      else if (n === 2 || q.ask !== "count")
        tip = { text: "Hör zu, wie Momo klatscht.", speech: ["Hör zu, wie Momo klatscht:", ...q.syllables] };
      else {
        root.querySelector("#syllable-help").hidden = false;
        tip = { text: "Schau: So teilt man das Wort in Silben.", speech: ["Schau:", ...q.syllables] };
      }
    } else if (q.mode === "spell") {
      // Two choices: one mistake leaves only the answer, so the rule comes at once.
      tip = q.tip;
      if (q.rule === "ae") {
        const help = root.querySelector("#spell-help");
        help.textContent = q.related ? `Verwandtes Wort: ${q.related}` : "Kein verwandtes Wort mit a oder au.";
        help.hidden = false;
        tip = q.related
          ? { text: `${q.tip.text} Denk an: ${q.related}.`, speech: `${q.tip.speech} Denk an ${q.related}.` }
          : { text: `${q.tip.text} Hier gibt es keins.`, speech: `${q.tip.speech} Hier gibt es keins.` };
      }
    } else if (q.mode === "wordtype") {
      const probes = q.choices.map((x) => PROBES[x]);
      if (n === 1) tip = { text: `Mach die Probe! ${probes.join(" ")}`, speech: ["Mach die Probe!", ...probes] };
      else {
        root.querySelector("#type-help").hidden = false;
        const extra = q.tricky
          ? " Achtung: Steht das, beim oder zum davor, wird auch ein Verb zum Nomen."
          : "";
        tip = { text: `Schau dir die Proben an.${extra}`, speech: [`Schau dir die Proben an.${extra}`] };
      }
    } else if (q.mode === "tense") {
      const help = root.querySelector("#tense-help");
      if (q.kind === "aux")
        tip = same(
          "Bewegt man sich von einem Ort zum anderen, sagt man meistens bin: Ich bin gelaufen. Sonst habe: Ich habe gespielt.",
        );
      else if (q.kind === "name") {
        if (n === 1) tip = same("Schau auf das Verb: Passiert es jetzt, ist es vorbei, oder kommt es noch?");
        else {
          help.innerHTML = q.forms.map((x) => `<span><strong>${x.label}:</strong> ${x.text}</span>`).join("");
          help.hidden = false;
          tip = { text: "Schau dir das Beispiel an.", speech: ["Schau dir das Beispiel an:", ...q.forms.map((x) => x.text)] };
        }
      } else if (n === 1)
        tip = same(
          q.kind === "past"
            ? `Wie sagt man es, wenn es gestern war? Sprich den Satz mit jeder Karte leise.${q.strong ? " Manche Verben ändern sich ganz: gehen – ging." : ""}`
            : "Sprich den Satz mit jeder Karte leise. Was klingt richtig?",
        );
      else {
        help.innerHTML = q.example.map((x) => `<span>${x}</span>`).join("");
        help.hidden = false;
        tip = { text: "Schau dir das Beispiel an.", speech: ["Zum Beispiel:", ...q.example] };
      }
    } else {
      // Only two endings, so only one mistake is possible: Momo lengthens the
      // word right away and shows it with the same gap.
      const at = q.long.lastIndexOf(q.end);
      const gapped = `${q.long.slice(0, at)}?${q.long.slice(at + 1)}`;
      const help = root.querySelector("#extend-help");
      help.textContent = `Verlängert: ${gapped}`;
      help.hidden = false;
      tip = {
        text: `Verlängere das Wort! Hör genau hin: ${gapped}`,
        speech: ["Verlängere das Wort! Hör genau hin:", `${q.long}.`],
      };
    }
    const named = namedPick(q, picked);
    return {
      text: [named?.text, tip.text].filter(Boolean).join(" "),
      speech: [named?.speech, tip.speech].flat().filter(Boolean),
    };
  }

  window.WieseDeutsch = { MODES, instruction, markup, reveal, hint };
})();
