/*
 * Views of the English games: task markup, stepped help and the revealed
 * answer, with the same interface as math.js and deutsch.js. Words and rules
 * come from core.js; the flow stays in app.js. English words are always
 * spoken as { en: … } parts by an English voice, never by the German one.
 */
(function () {
  "use strict";
  const C = window.Wiese;
  const MODES = C.ENGLISH_GAMES;
  const TOGETHER = ["ensimon", "ensay"];
  const same = (text) => ({ text, speech: text });

  function instruction(q) {
    switch (q.mode) {
      case "enwords":
        return same("Hör gut zu: Welches Bild ist das?");
      case "enmissing":
        return same("Hör gut zu: Welches Bild sagt Momo nicht?");
      case "enpattern":
        return same("Hör zu und schau: Was kommt als Nächstes?");
      case "encolors":
        return same(
          q.ask === "colour"
            ? "Hör gut zu: Welche Farbe ist das?"
            : q.ask === "shape"
              ? "Hör gut zu: Welche Form ist das?"
              : "Hör gut zu: Welche Karte passt?",
        );
      case "ennumbers":
        return same(
          q.show === "digits" ? "Hör gut zu: Welche Zahl ist das?" : "Hör gut zu: Welche Karte passt?",
        );
      case "ensimon":
        return same(
          q.actions.length > 1 ? "Hör gut zu und mach alles nach!" : "Hör gut zu und mach mit!",
        );
      default:
        return same(
          q.words.length > 1
            ? "Wie heißen die Bilder auf Englisch? Sag sie laut!"
            : "Wie heißt das auf Englisch? Sag es laut!",
        );
    }
  }

  /* ---------- Drawings: colours, shapes, dice and sets ---------- */
  const starPoints = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 19 : 45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(54 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  const SHAPES = {
    blob: '<path d="M50 9c19-2 37 11 39 31 3 21-9 45-33 49-23 4-45-9-46-31C9 36 27 11 50 9Z"/><circle cx="84" cy="80" r="6"/><circle cx="16" cy="18" r="4"/>',
    circle: '<circle cx="50" cy="50" r="40"/>',
    square: '<rect x="12" y="12" width="76" height="76" rx="5"/>',
    triangle: '<path d="M50 9 93 87H7Z"/>',
    star: `<polygon points="${starPoints}"/>`,
    heart: '<path d="M50 88C20 66 6 48 6 32 6 18 17 8 30 8c10 0 17 6 20 14 3-8 10-14 20-14 13 0 24 10 24 24 0 16-14 34-44 56Z"/>',
  };
  function shapeSvg(shape, colour) {
    const hex = C.EN_COLOURS.find((x) => x.en === colour).hex;
    // White needs a visible outline on the light card.
    const stroke = colour === "white" ? "#8f978c" : "#00000026";
    return `<svg class="shape-svg" viewBox="0 0 100 100" aria-hidden="true"><g fill="${hex}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round">${SHAPES[shape]}</g></svg>`;
  }
  const DICE = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
  };
  function dice(n) {
    if (!DICE[n]) return `<span class="choice-number">${n}</span>`;
    return `<span class="dice" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<span${DICE[n].includes(i + 1) ? ' class="pip"' : ""}></span>`).join("")}</span>`;
  }
  const things = (n, icon) =>
    `<span class="set-things${n > 5 ? " many" : ""}" aria-hidden="true">${Array.from({ length: n }, () => `<span>${icon}</span>`).join("")}</span>`;

  /* ---------- Markup ---------- */
  function card(value, label, art, caption, cls = "") {
    return `<button class="picture-button ${cls}" data-answer="${value}" aria-label="${label}">${art}<span class="choice-caption">${caption}</span></button>`;
  }
  const iconArt = (icon) => `<span class="choice-icon" aria-hidden="true">${icon}</span>`;
  function wordCards(q) {
    return `<div class="picture-choices english-choices">${q.items.map((x) => card(x.value, x.de, iconArt(x.icon), x.value)).join("")}</div>`;
  }
  function selfCheck(note, solution) {
    return `<p class="together-note"><span aria-hidden="true">👥</span> ${note}</p><div class="self-check"><button id="echo-done" class="button primary">✓ Hat geklappt</button><button id="echo-retry" class="button secondary">↺ Noch nicht ganz</button></div><button id="compare-echo" class="text-button" aria-expanded="false">Lösung zeigen</button><div id="echo-answer" hidden>${solution}</div>`;
  }
  function markup(q, listen) {
    const ear = '<div class="word-picture no-picture" aria-hidden="true">🎧</div>';
    switch (q.mode) {
      case "enwords":
        return `${ear}${listen("Wort anhören")}${wordCards(q)}`;
      case "enmissing":
        return `${listen("Wörter anhören")}${wordCards(q)}`;
      case "enpattern": {
        const icon = (en) => C.EN_WORDS.find((x) => x.en === en).icon;
        const slots = q.row
          .map(
            (en, i) =>
              `<span class="pattern-slot${i % q.period === 0 ? " unit-start" : ""}" data-slot="${i}">${icon(en)}</span>`,
          )
          .join("");
        return `<div class="pattern-row" id="pattern-row" aria-label="Reihe mit Lücke am Ende">${slots}<span class="pattern-slot gap${q.row.length % q.period === 0 ? " unit-start" : ""}" data-reveal>?</span></div>${listen("Reihe anhören")}${wordCards(q)}`;
      }
      case "encolors":
        return `${ear}${listen("Anhören")}<div class="picture-choices english-choices shape-choices">${q.items
          .map((x) =>
            card(
              x.value,
              x.de,
              x.count > 1
                ? `<span class="shape-set${x.count > 4 ? " many" : ""}">${Array.from({ length: x.count }, () => shapeSvg(x.shape, x.colour)).join("")}</span>`
                : shapeSvg(x.shape, x.colour),
              x.en,
            ),
          )
          .join("")}</div>`;
      case "ennumbers":
        return `${ear}${listen("Zahl anhören")}<div class="picture-choices english-choices number-cards ${q.show}">${q.choices
          .map((value) => {
            const n = Number(value);
            const art =
              q.show === "dots" ? dice(n) : q.show === "things" ? things(n, q.icon) : `<span class="choice-number">${n}</span>`;
            return card(value, value, art, C.EN_NUMBERS[n]);
          })
          .join("")}</div>`;
      case "ensimon":
        return `<div class="echo-symbol" aria-hidden="true">🙋</div>${listen("Anhören")}${selfCheck(
          "Ein Erwachsener schaut zu und entscheidet.",
          `<div class="sequence-cards">${q.actions.map((x, i) => `<div class="sequence-card english-card"><span class="sequence-number">${i + 1}</span><span class="move-icon" aria-hidden="true">${x.icon}</span><span lang="en">${x.en}</span><small>${x.de}</small></div>`).join("")}</div>`,
        )}`;
      default:
        return `<div class="say-pictures">${q.words.map((x) => `<span class="say-picture" role="img" aria-label="${x.de}">${x.icon}</span>`).join("")}</div>${selfCheck(
          "Ein Erwachsener hört zu und entscheidet.",
          `<div class="sequence-cards">${q.words.map((x) => `<div class="sequence-card english-card"><span class="move-icon" aria-hidden="true">${x.icon}</span><span lang="en">${x.en}</span><small>${x.de}</small></div>`).join("")}</div><button class="big-listen" id="solution-listen"><span aria-hidden="true">🔊</span> Lösung anhören</button>`,
        )}`;
    }
  }

  function reveal(q, root, value) {
    const gap = root.querySelector("[data-reveal]");
    if (gap) {
      gap.textContent = q.items.find((x) => x.value === value).icon;
      gap.classList.add("found");
    }
    // After solving, the written English words appear under the pictures.
    root.querySelector(".english-choices")?.classList.add("labeled");
  }

  // The English name of a card (the word, "a red circle", "seven").
  function nameOf(q, value) {
    if (q.mode === "encolors") return q.items.find((x) => x.value === value).en;
    if (q.mode === "ennumbers") return C.EN_NUMBERS[Number(value)];
    return value;
  }
  function germanOf(q, value) {
    if (q.mode === "ennumbers") return C.numberWord(Number(value));
    return q.items.find((x) => x.value === value).de;
  }
  /*
   * Help in steps. A wrong pick is named in English (so it is learned too);
   * from the second mistake Momo names every card that is left while it
   * lights up, then the task is heard again.
   */
  function hint(q, n, picked, root) {
    // Together games: the adult tapped "Noch nicht ganz".
    if (q.mode === "ensimon") return same("Kein Problem! Hör noch einmal gut zu und mach es nach.");
    if (q.mode === "ensay")
      return { ...same("Kein Problem! Hör gut zu und sag es nach."), replay: q.solution };
    const remaining = [...root.querySelectorAll("[data-answer]:not(:disabled)")].map(
      (button) => button.dataset.answer,
    );
    const names = remaining.map((value) => ({
      en: nameOf(q, value),
      gap: 500,
      highlight: `[data-answer="${value}"]`,
    }));
    if (q.mode === "enmissing") {
      const named = picked ? { text: `„${picked}“ hat Momo gesagt.`, speech: [{ en: picked }, "hat Momo gesagt."] } : null;
      if (n === 1)
        return {
          text: [named?.text, "Hör noch einmal genau zu!"].filter(Boolean).join(" "),
          speech: [...(named?.speech || []), "Hör noch einmal genau zu!"],
        };
      // Now every said word lights up: the missing one stays dark.
      return {
        text: [named?.text, "Schau, was leuchtet. Welches Bild bleibt dunkel?"].filter(Boolean).join(" "),
        speech: [...(named?.speech || []), "Schau, was leuchtet."],
        replay: q.said.map((en) => ({ en, gap: 700, highlight: `[data-answer="${en}"]` })),
      };
    }
    const named = picked
      ? q.mode === "enpattern"
        ? { text: `„${picked}“ passt hier nicht.`, speech: [{ en: picked }, "passt hier nicht."] }
        : { text: `Das ist „${nameOf(q, picked)}“ – ${germanOf(q, picked)}.`, speech: ["Das ist", { en: nameOf(q, picked) }, `– ${germanOf(q, picked)}.`] }
      : null;
    let tip;
    if (q.mode === "enpattern") {
      if (n === 1) tip = same("Sprich die Reihe leise mit. Was kommt immer wieder?");
      else {
        root.querySelector("#pattern-row").classList.add("grouped");
        tip = same("Schau: Diese Teile wiederholen sich immer wieder.");
      }
    } else if (n === 1) tip = same("Hör noch einmal genau hin!");
    else {
      root.querySelector(".english-choices").classList.add("labeled");
      tip = {
        text: "Hör zu, wie die Karten heißen. Welche hast du gehört?",
        speech: ["Hör zu, wie die Karten heißen:", ...names, "Und jetzt noch einmal:"],
      };
    }
    return {
      text: [named?.text, tip.text].filter(Boolean).join(" "),
      speech: [...(named?.speech || []), tip.speech].flat(),
    };
  }

  window.WieseEnglish = { MODES, TOGETHER, instruction, markup, reveal, hint };
})();
