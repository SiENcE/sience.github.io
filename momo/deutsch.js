/*
 * Views of the newer German games (syllables, lengthening words): task
 * markup, stepped help and the revealed answer, with the same interface as
 * math.js. Rules and words come from core.js; the flow stays in app.js.
 * The voice never gets a single letter: syllables have two letters or more,
 * and endings are named only in the text or played as sounds.
 */
(function () {
  "use strict";
  const C = window.Wiese;
  const W = C.numberWord;
  const MODES = ["syllables", "extend"];
  const same = (text) => ({ text, speech: text });
  const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

  function instruction(q) {
    if (q.mode === "syllables")
      return same(
        q.ask === "count"
          ? "Hör gut zu: Wie viele Silben hat das Wort?"
          : "Hör gut zu: Welche Silbe fehlt?",
      );
    return same("Hör gut zu: Wie endet das Wort?");
  }

  function buttons(choices, cls) {
    return `<div class="answer-choices">${choices.map((choice) => `<button class="letter-button ${cls}" data-answer="${choice}" aria-label="${choice}">${choice}</button>`).join("")}</div>`;
  }
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
    return `${picture}${listen("Wort anhören")}<div class="merk-word" aria-label="Wort mit Lücke">${q.stem}<span class="merk-gap" data-reveal>?</span></div><p class="merk-tip" id="extend-help" hidden></p>${buttons(q.choices, "merk-choice")}`;
  }

  function reveal(q, root, value) {
    const target = root.querySelector("[data-reveal]");
    if (!target) return;
    target.textContent = value;
    target.classList.add("found");
  }

  function namedPick(q, picked) {
    if (picked == null) return null;
    if (q.mode === "extend")
      return { text: `${picked} passt nicht.`, speech: "Dieser Buchstabe passt nicht." };
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
