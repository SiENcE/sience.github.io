/*
 * Math views: task markup, stepped help and the revealed answer for the math
 * games. Rules, tasks and number words come from core.js; the game flow
 * (answering, stars, speech) stays in app.js.
 */
(function () {
  "use strict";
  const C = window.Wiese;
  const W = C.numberWord;
  // "ein Zehner", "vier Einer" – numbers in speech are always words.
  const countWord = (n) => (n === 1 ? "ein" : W(n));
  // Digits in a tip are spoken as words ("1 mehr" → "eins mehr").
  const same = (text) => ({ text, speech: text.replace(/\d+/g, (n) => W(Number(n))) });
  const capitalize = (text) => text[0].toUpperCase() + text.slice(1);
  const sign = (n) => (n < 0 ? "−" : "+");
  const signWord = (n) => (n < 0 ? "minus" : "plus");
  const gap = '<span class="math-gap" data-reveal>?</span>';
  const COMPARE_WORDS = { "<": "kleiner als", ">": "größer als", "=": "gleich" };

  /* ---------- Building blocks ---------- */
  /*
   * Base-ten blocks: rods of ten and single cubes (in rows of five). The rod
   * labels (10, 20, 30 …) only show as help; "group" frames ten loose ones.
   */
  function blocks(tens, ones, { onesFirst = false, group = false } = {}) {
    const rods = `<span class="rods">${Array.from({ length: tens }, (_, i) => `<span class="rod"><span class="rod-label">${(i + 1) * 10}</span></span>`).join("")}</span>`;
    const cube = '<span class="cube"></span>';
    const loose =
      group && ones >= 10
        ? `<span class="cube-ten">${cube.repeat(10)}</span>${cube.repeat(ones - 10)}`
        : cube.repeat(ones);
    const cubes = `<span class="cubes">${loose}</span>`;
    return `<div class="blocks" role="img" aria-label="Zehnerstangen und Einerwürfel">${onesFirst ? cubes + rods : rods + cubes}</div>`;
  }
  function numberButtons(choices, labels = {}) {
    return `<div class="answer-choices">${choices.map((value) => `<button class="letter-button number-button" data-answer="${value}" aria-label="${labels[value] || value}">${value}</button>`).join("")}</div>`;
  }
  // Picture cards with a visible caption (the chart shows the same words).
  function pictureButtons(items) {
    return `<div class="picture-choices labeled">${items.map((item) => `<button class="picture-button" data-answer="${item.word}" aria-label="${item.word}"><span class="choice-icon" aria-hidden="true">${item.icon}</span><span class="choice-caption">${item.word}</span></button>`).join("")}</div>`;
  }
  /*
   * Number line as SVG: long ticks at tens, middle ones at fives. "helpLabels"
   * only appear as help; the balloon marks the number to find.
   */
  function numberLine({ from, to, ticks = 1, labels, helpLabels = [], marker = null, gap = false }) {
    const width = 400;
    const pad = 22;
    const y = 66;
    const x = (n) => (pad + ((n - from) / (to - from)) * (width - 2 * pad)).toFixed(1);
    let marks = "";
    for (let n = from; n <= to; n += ticks) {
      const size = n % 10 === 0 ? 14 : n % 5 === 0 ? 10 : 6;
      marks += `<line x1="${x(n)}" x2="${x(n)}" y1="${y - size}" y2="${y + size}" class="tick${n % 10 === 0 ? " ten" : ""}"/>`;
    }
    const text = (n, cls) =>
      `<text x="${x(n)}" y="${y + 36}" class="${cls}" data-n="${n}">${n}</text>`;
    const balloon =
      marker == null
        ? ""
        : `<g class="balloon"><line x1="${x(marker)}" x2="${x(marker)}" y1="${y - 14}" y2="${y - 30}"/><circle cx="${x(marker)}" cy="${y - 46}" r="16"/><text x="${x(marker)}" y="${y - 41}" class="balloon-text"${gap ? " data-reveal" : ""}></text></g>`;
    return `<svg class="number-line" viewBox="0 0 ${width} 112" role="img" aria-label="Zahlenstrahl von ${from} bis ${to}${marker == null ? "" : " mit einem Ballon"}"><line x1="${pad - 10}" x2="${width - pad + 10}" y1="${y}" y2="${y}" class="axis"/>${marks}${labels.map((n) => text(n, "line-label")).join("")}${helpLabels.map((n) => text(n, "line-label help-label")).join("")}${balloon}</svg>`;
  }
  // Ten boxes, the first "filled" of them full: how far to the next ten?
  function tenFrame(filled) {
    return `<div class="ten-frame" role="img" aria-label="Zehnerfeld">${Array.from({ length: 10 }, (_, i) => `<span class="${i < filled ? "full" : ""}"></span>`).join("")}</div>`;
  }
  // The whole hundred chart as help; the given numbers are marked.
  function hundredChart(marked) {
    return `<div class="hundred-chart" aria-hidden="true">${Array.from({ length: 100 }, (_, i) => `<span class="${marked.includes(i + 1) ? "marked" : ""}">${i + 1}</span>`).join("")}</div>`;
  }
  function tile(text, { hole = false, caption = "" } = {}) {
    return `<span class="number-slot"><span class="number-tile${hole ? " hole" : ""}"${hole ? " data-reveal" : ""}>${hole ? "?" : text}</span>${caption ? `<span class="tile-caption">${caption}</span>` : ""}</span>`;
  }
  function placeChips(tens, ones) {
    return `<span class="place-chip tens"><strong>${tens}</strong> Z</span><span class="place-chip ones"><strong>${ones}</strong> E</span>`;
  }

  /* ---------- Instructions ---------- */
  // The number to find is never spoken; numbers in speech are words.
  function instruction(q) {
    switch (q.mode) {
      case "bundle":
        return same("Welche Zahl ist das? Zähle die Zehner und die Einer.");
      case "place":
        return same(
          {
            tens: "Wie viele Zehner hat die Zahl?",
            ones: "Wie viele Einer hat die Zahl?",
            split: "Zerlege die Zahl. Was fehlt?",
          }[q.kind] || "Welche Zahl ist das?",
        );
      case "build": {
        if (!q.delta)
          return same(
            q.hidden
              ? "Hör gut zu und lege die Zahl mit Zehnern und Einern."
              : "Lege die Zahl mit Zehnern und Einern.",
          );
        const amount = Math.abs(q.delta);
        const way = q.delta > 0 ? "mehr" : "weniger";
        return {
          text: `${q.hidden ? "" : `Hier liegt ${q.startNumber}. `}Lege ${amount} ${way}!`,
          speech: `${q.hidden ? "" : `Hier liegt ${W(q.startNumber)}. `}Lege ${W(amount)} ${way}!`,
        };
      }
      case "line":
        return same("Welche Zahl zeigt der Ballon?");
      case "chart":
        return same("Welche Zahl fehlt in der Hundertertafel?");
      case "steps":
        return same(
          q.gap === q.sequence.length - 1 ? "Wie geht es weiter?" : "Welche Zahl fehlt in der Reihe?",
        );
      case "compare":
        return same("Welches Zeichen passt? Das Krokodil frisst die größere Zahl.");
      case "sort":
        return same(
          q.reverse
            ? "Tippe die Zahlen von der größten bis zur kleinsten an."
            : "Tippe die Zahlen von der kleinsten bis zur größten an.",
        );
      case "adjacent":
        return same(
          {
            after: "Welche Zahl kommt danach?",
            before: "Welche Zahl kommt davor?",
            between: "Welche Zahl liegt dazwischen?",
            tenBelow: "Welcher volle Zehner kommt davor?",
            tenAbove: "Welcher volle Zehner kommt danach?",
          }[q.kind],
        );
      case "calc":
        return same(
          q.op === "fillUp"
            ? "Wie viel fehlt bis zum vollen Zehner?"
            : q.op === "fillDown"
              ? "Wie viel musst du wegnehmen bis zum vollen Zehner?"
              : "Rechne aus.",
        );
      default:
        return same(q.question);
    }
  }

  /* ---------- Task markup ---------- */
  function markup(q, listen) {
    switch (q.mode) {
      case "bundle":
        return `${blocks(q.tens, q.ones, { onesFirst: q.onesFirst })}<p class="math-help" id="math-help" hidden></p>${numberButtons(q.choices)}`;
      case "place": {
        const digits = ["tens", "ones"].includes(q.kind);
        // A two-digit number in the place-value house, tens and ones in words,
        // or the number split into tens and ones.
        const chips = [
          `<span class="place-chip tens"><strong>${q.tens}</strong> Zehner</span>`,
          `<span class="place-chip ones"><strong>${q.ones}</strong> Einer</span>`,
        ];
        if (q.kind === "swapped") chips.reverse();
        const shown = digits
          ? `<div class="place-number" id="place-number" aria-label="Zahl ${q.number}"><span class="place-digit tens"><span class="place-label" hidden>Z</span>${q.tens}</span><span class="place-digit ones"><span class="place-label" hidden>E</span>${q.ones}</span></div>`
          : q.kind === "split"
            ? `<div class="equation">${q.number} = ${q.findTens ? gap : q.tens * 10} + ${q.findTens ? q.ones : gap}</div>`
            : `<div class="place-sum">${chips.join('<span class="place-and">und</span>')}</div>`;
        return `${shown}${listen(digits ? "Zahl anhören" : "Anhören")}${numberButtons(q.choices)}<div class="math-help" id="math-help" hidden>${blocks(q.tens, q.ones, { group: q.kind === "bundle" })}</div>`;
      }
      case "build": {
        const target = q.delta
          ? ""
          : `<div class="number-target${q.hidden ? " no-picture" : ""}" aria-hidden="true">${q.hidden ? "👂" : q.number}</div>`;
        const column = (place, title, noun) =>
          `<div class="place-column ${place}"><h2 class="place-head">${title}</h2><div class="place-blocks" id="built-${place}"></div><span class="place-count" id="count-${place}" hidden></span><div class="place-buttons"><button class="step-button" data-build="${place}" data-step="-1" aria-label="${noun} wegnehmen">−</button><button class="step-button" data-build="${place}" data-step="1" aria-label="${noun} dazulegen">+</button></div></div>`;
        return `${target}${q.speech ? listen("Zahl anhören") : ""}<div class="place-house">${column("tens", "Zehner", "Einen Zehner")}${column("ones", "Einer", "Einen Einer")}</div><p class="math-help" id="math-help" hidden></p><button id="build-done" class="button primary build-done">✓ Fertig</button>`;
      }
      case "line":
        return `${numberLine({ ...q, marker: q.number, gap: true })}${numberButtons(q.choices)}`;
      case "chart":
        return `<div class="hundred-piece" style="--cols:${q.grid[0].length}" role="img" aria-label="Ausschnitt aus der Hundertertafel">${q.grid
          .flat()
          .map((cell) =>
            cell.state === "empty"
              ? '<span class="hundred-cell empty"></span>'
              : cell.state === "gap"
                ? '<span class="hundred-cell gap" data-reveal>?</span>'
                : `<span class="hundred-cell">${cell.n}</span>`,
          )
          .join("")}</div>${numberButtons(q.choices)}<div class="math-help" id="math-help" hidden>${hundredChart(q.shown)}</div>`;
      case "steps": {
        const arrow = `<span class="step-arrow" hidden>${sign(q.step)}${Math.abs(q.step)}</span>`;
        const row = q.sequence.map((n, i) => tile(n, { hole: i === q.gap })).join(arrow);
        return `<div class="number-row">${row}</div>${listen("Zahlen anhören")}${numberButtons(q.choices)}`;
      }
      case "compare": {
        const side = (part) =>
          `<span class="compare-side"><span class="number-tile wide">${part.text}</span><span class="compare-help" hidden>${placeChips(Math.floor(part.value / 10), part.value % 10)}</span></span>`;
        return `<div class="compare-row">${side(q.left)}<span class="number-tile hole compare-gap" data-reveal>?</span>${side(q.right)}</div>${listen("Zahlen anhören")}${numberButtons(q.choices, COMPARE_WORDS)}`;
      }
      case "sort": {
        const card = (value) =>
          `<button class="letter-button number-card" data-answer="${value}" aria-label="${value}"><span class="digit-tens">${value.slice(0, -1)}</span><span class="digit-ones">${value.slice(-1)}</span></button>`;
        return `<div class="order-slots number-slots" aria-label="Deine Reihe">${q.order.map((_, i) => `<div class="order-slot" aria-label="Platz ${i + 1}, noch leer"><span>${i + 1}</span></div>`).join("")}</div><p class="sort-direction" aria-hidden="true">${q.reverse ? "groß → klein" : "klein → groß"}</p><div class="order-cards">${q.cards.map(card).join("")}</div>`;
      }
      case "adjacent": {
        const ten = q.kind.startsWith("ten");
        const row =
          q.kind === "between"
            ? tile(q.shown[0]) + tile("", { hole: true }) + tile(q.shown[1])
            : ["after", "tenAbove"].includes(q.kind)
              ? tile(q.number) + tile("", { hole: true, caption: ten ? "Zehner danach" : "danach" })
              : tile("", { hole: true, caption: ten ? "Zehner davor" : "davor" }) + tile(q.number);
        const tens = [];
        for (let n = q.line.from; n <= q.line.to; n += 10) tens.push(n);
        return `<div class="number-row">${row}</div>${listen("Zahl anhören")}${numberButtons(q.choices)}<div class="math-help" id="math-help" hidden>${numberLine({ from: q.line.from, to: q.line.to, labels: tens, marker: q.kind === "between" ? null : q.number })}</div>`;
      }
      case "calc": {
        const op = q.minus ? "−" : "+";
        const task = q.fill
          ? `${q.a} ${op} ${gap} = ${q.result}`
          : `${q.a} ${op} ${q.b} = ${gap}`;
        const help = q.fill
          ? tenFrame(q.a % 10)
          : `${blocks(Math.floor(q.a / 10), q.a % 10)}<p>${op} ${q.b / 10} Zehner</p>`;
        return `<div class="equation">${task}</div>${listen("Aufgabe anhören")}${numberButtons(q.choices)}<div class="math-help" id="math-help" hidden>${help}</div>`;
      }
      case "graph": {
        const max = Math.max(9, ...q.bars.map((bar) => bar.value));
        const chart = `<div class="bar-chart" role="img" aria-label="${q.topic}: ${q.bars.map((bar) => `${bar.word} ${bar.value}`).join(", ")}">${q.bars
          .map(
            (bar, i) =>
              `<div class="bar-col" data-bar="${i}"><span class="bar-value" hidden>${bar.value}</span><span class="bar-stack">${Array.from({ length: max }, (_, k) => `<span class="bar-box${k < bar.value ? " full" : ""}">${k < bar.value ? `<span class="box-n" hidden>${k + 1}</span>` : ""}</span>`).join("")}</span><span class="bar-icon" aria-hidden="true">${bar.icon}</span><span class="bar-word">${bar.word}</span></div>`,
          )
          .join("")}</div>`;
        const choices = ["most", "least"].includes(q.kind)
          ? pictureButtons(q.choices)
          : numberButtons(q.choices);
        return `<p class="chart-title">${q.topic}</p>${chart}${choices}`;
      }
      default:
        return "";
    }
  }

  // Updates the laid blocks in place, so taps on the +/− buttons are never lost.
  function renderBuilt(root, built, answered) {
    const { tens, ones } = built;
    const pieces = (count, cls) => `<span class="${cls}"></span>`.repeat(count);
    root.querySelector("#built-tens").innerHTML = `<span class="rods">${pieces(tens, "rod")}</span>`;
    root.querySelector("#built-ones").innerHTML = `<span class="cubes">${pieces(ones, "cube")}</span>`;
    root.querySelector("#count-tens").textContent = tens;
    root.querySelector("#count-ones").textContent = ones;
    for (const button of root.querySelectorAll("[data-build]")) {
      const value = built[button.dataset.build];
      button.disabled = answered || (button.dataset.step === "1" ? value >= 9 : value <= 0);
    }
  }

  // After a right answer the gap shows it (equation, tile, balloon, chart cell).
  function reveal(q, root, value) {
    const target = root.querySelector("[data-reveal]");
    if (!target) return;
    target.textContent = value;
    target.classList.add("found");
  }

  /* ---------- Stepped help ---------- */
  function namedPick(q, picked) {
    if (picked == null || q.mode === "build") return null;
    if (q.mode === "sort")
      return { text: `${picked} ist noch nicht dran.`, speech: `${capitalize(W(Number(picked)))} ist noch nicht dran.` };
    if (q.mode === "compare")
      return { text: `${picked} passt nicht.`, speech: "Dieses Zeichen passt nicht." };
    if (/^\d+$/.test(picked))
      return { text: `${picked} passt nicht.`, speech: `${capitalize(W(Number(picked)))} passt nicht.` };
    return same(`${picked} passt nicht.`);
  }
  /*
   * Help in steps, as in the letter games: the wrong pick is named, then a
   * tip; from the second mistake visible help in the task.
   */
  function hint(q, n, picked, root, built) {
    const find = (selector) => root.querySelector(selector);
    const showAll = (selector) =>
      root.querySelectorAll(selector).forEach((element) => {
        element.hidden = false;
      });
    const help = (text) => {
      const element = find("#math-help");
      if (text != null) element.textContent = text;
      element.hidden = false;
    };
    const tip = tipFor(q, n, { find, showAll, help, built });
    const named = namedPick(q, picked);
    return {
      text: [named?.text, tip.text].filter(Boolean).join(" "),
      speech: [named?.speech, tip.speech].filter(Boolean).join(" "),
    };
  }
  function tipFor(q, n, { find, showAll, help, built }) {
    switch (q.mode) {
      case "bundle":
        if (n === 1) return same("Zähle zuerst die Zehner, dann die Einer.");
        if (n === 2) {
          find(".blocks").classList.add("counting");
          return {
            text: "Zähle die Zehner so: 10, 20, 30 … Dann zähle die Einer dazu.",
            speech: "Zähle die Zehner so: zehn, zwanzig, dreißig. Dann zähle die Einer dazu.",
          };
        }
        help(`${q.tens} Zehner und ${q.ones} Einer`);
        return {
          text: "Schau: So viele Zehner und Einer sind es.",
          speech: `Das sind ${countWord(q.tens)} Zehner und ${countWord(q.ones)} Einer.`,
        };
      case "place":
        return placeTip(q, n, { find, showAll, help });
      case "build":
        return buildTip(q, n, { showAll, help, built });
      case "line":
        if (n === 1)
          return same("Schau, welche Zahl kurz vor dem Ballon steht. Zähle von dort die Striche weiter.");
        find(".number-line").classList.add("helping");
        if (n === 2) return same("Jetzt stehen mehr Zahlen dran. Zähle von der Zahl vor dem Ballon weiter.");
        find(`.number-line [data-n="${q.base}"]`)?.classList.add("base");
        return {
          text: `Fang bei ${q.base} an und zähle die Striche weiter.`,
          speech: `Fang bei ${W(q.base)} an und zähle die Striche weiter.`,
        };
      case "chart":
        if (n === 1) return same("In der Hundertertafel: nach rechts 1 mehr, nach unten 10 mehr.");
        help();
        return same("Schau in die ganze Hundertertafel. Wo stehen die Zahlen?");
      case "steps": {
        if (n === 1)
          return same(
            q.step > 0 ? "Schau: Wie viel kommt jedes Mal dazu?" : "Schau: Wie viel geht jedes Mal weg?",
          );
        showAll(".step-arrow");
        const amount = Math.abs(q.step);
        return {
          text: `Immer ${sign(q.step)} ${amount}.`,
          speech: `Immer ${signWord(q.step)} ${W(amount)}.`,
        };
      }
      case "compare":
        if (n === 1)
          return same(
            q.kind === "sum"
              ? "Rechne zuerst aus, wie viel das zusammen ist. Das Krokodil frisst die größere Zahl."
              : "Das Krokodil frisst immer die größere Zahl. Vergleiche zuerst die Zehner.",
          );
        showAll(".compare-help");
        return same("Schau: Wer hat mehr Zehner? Sind die Zehner gleich, dann vergleiche die Einer.");
      case "sort":
        if (n === 1)
          return same(
            q.reverse
              ? "Suche die größte Zahl, die noch übrig ist."
              : "Suche die kleinste Zahl, die noch übrig ist.",
          );
        find(".order-cards").classList.add("marked");
        return same("Schau zuerst auf die Zehner (blau). Sind sie gleich, dann auf die Einer.");
      case "adjacent":
        if (n === 1)
          return q.kind.startsWith("ten")
            ? {
                text: "Nachbarzehner sind volle Zehner: 10, 20, 30 …",
                speech: "Nachbarzehner sind volle Zehner: zehn, zwanzig, dreißig.",
              }
            : same(
                {
                  after: "Danach heißt: 1 mehr.",
                  before: "Davor heißt: 1 weniger.",
                  between: "Die Zahl in der Mitte ist 1 mehr als die linke Zahl.",
                }[q.kind],
              );
        help();
        return same("Schau auf den Zahlenstrahl.");
      case "calc":
        if (n === 1) {
          if (q.op === "fillUp") return same("Wie viele Einer fehlen bis zum nächsten vollen Zehner?");
          if (q.op === "fillDown") return same("Nimm die Einer weg. Dann bist du beim vollen Zehner.");
          if (q.op.startsWith("N")) return same("Die Einer bleiben gleich. Nur die Zehner ändern sich.");
          return {
            text: `Rechne mit den Zehnern: ${q.a / 10} Zehner ${q.minus ? "minus" : "plus"} ${q.b / 10} Zehner.`,
            speech: `Rechne mit den Zehnern: ${countWord(q.a / 10)} Zehner ${q.minus ? "minus" : "plus"} ${countWord(q.b / 10)} Zehner.`,
          };
        }
        help();
        if (q.fill)
          return same(q.op === "fillUp" ? "Wie viele Kästchen sind noch frei?" : "Wie viele Kästchen sind voll?");
        return same(
          q.minus
            ? "Schau dir die Stangen an. Nimm in Gedanken Zehner weg."
            : "Schau dir die Stangen an. Lege in Gedanken Zehner dazu.",
        );
      case "graph":
        return graphTip(q, n, { find, showAll });
      default:
        return same("Versuch es noch einmal.");
    }
  }
  function placeTip(q, n, { find, showAll, help }) {
    if (q.kind === "tens" || q.kind === "ones") {
      if (n === 1) return same("Die Zehner stehen vorne, die Einer hinten.");
      showAll(".place-label");
      find("#place-number").classList.add("marked");
      help();
      return same("Schau ins Zahlenhaus: Links wohnen die Zehner, rechts die Einer.");
    }
    if (q.kind === "bundle") {
      if (n === 1)
        return {
          text: "Aus 10 Einern kann man 1 Zehner bündeln.",
          speech: "Aus zehn Einern kann man einen Zehner bündeln.",
        };
      help();
      return {
        text: "10 Einer sind 1 Zehner. Wie viele Zehner sind es dann?",
        speech: "Zehn Einer sind ein Zehner. Wie viele Zehner sind es dann?",
      };
    }
    if (q.kind === "split") {
      if (n === 1) return same("Zerlegen heißt: die Zehnerzahl plus die Einer.");
      help();
      find("#math-help .blocks").classList.add("counting");
      return q.findTens
        ? {
            text: "Zähle die Stangen: 10, 20, 30 … Das ist die Zehnerzahl.",
            speech: "Zähle die Stangen: zehn, zwanzig, dreißig. Das ist die Zehnerzahl.",
          }
        : same("Zähle die einzelnen Würfel. Das sind die Einer.");
    }
    if (n === 1)
      return same(
        q.kind === "swapped"
          ? "Achtung: Hier kommen die Einer zuerst. Die Zehner schreibt man aber vorne."
          : "Die Zehner schreibt man vorne, die Einer hinten.",
      );
    help();
    return same("Schau dir die Zehner und Einer an. Welche Zahl ist das?");
  }
  function buildTip(q, n, { showAll, help, built }) {
    if (n === 1) return same("Das passt noch nicht. Stimmen die Zehner? Stimmen die Einer?");
    if (n === 2) {
      // Now the laid counts are shown, and Momo says which place is off.
      showAll(".place-count");
      if (q.delta) {
        const amount = Math.abs(q.delta);
        const unit = amount === 10 ? "Zehner" : "Einer";
        const way = q.delta > 0 ? ["mehr", "dazu"] : ["weniger", "weg"];
        return {
          text: `${amount} ${way[0]} heißt: 1 ${unit} ${way[1]}.`,
          speech: `${W(amount)} ${way[0]} heißt: einen ${unit} ${way[1]}.`,
        };
      }
      const place = built.tens !== q.target.tens ? "tens" : "ones";
      const few = built[place] < q.target[place];
      return same(
        `Bei den ${place === "tens" ? "Zehnern" : "Einern"} sind es noch zu ${few ? "wenige" : "viele"}.`,
      );
    }
    help(`${q.number} = ${q.target.tens} Zehner und ${q.target.ones} Einer`);
    return {
      text: "Schau: So viele Zehner und Einer brauchst du.",
      speech: `Du brauchst ${countWord(q.target.tens)} Zehner und ${countWord(q.target.ones)} Einer.`,
    };
  }
  function graphTip(q, n, { find, showAll }) {
    const bar = q.target != null ? q.bars[q.target] : null;
    const [high, low] = q.pair ? q.pair.map((i) => q.bars[i]) : [];
    if (n === 1) {
      if (q.kind === "value")
        return {
          text: `Zähle die Kästchen bei ${bar.icon} ${bar.word}.`,
          speech: `Zähle die Kästchen bei ${bar.word}.`,
        };
      if (q.kind === "most") return same("Die höchste Säule zeigt, was die meisten mögen.");
      if (q.kind === "least") return same("Die niedrigste Säule zeigt, was die wenigsten mögen.");
      if (q.kind === "diff")
        return same(`Vergleiche die Säulen von ${high.word} und ${low.word}. Wie viele Kästchen hat ${high.word} mehr?`);
      return same("Zähle alle Kästchen zusammen.");
    }
    if (q.kind === "value") {
      find(`[data-bar="${q.target}"]`)
        .querySelectorAll(".box-n")
        .forEach((number) => {
          number.hidden = false;
        });
      return same("Zähle mit: 1, 2, 3 …");
    }
    if (q.kind === "diff") {
      // The boxes the higher bar has more light up.
      [...find(`[data-bar="${q.pair[0]}"]`).querySelectorAll(".bar-box.full")]
        .slice(low.value)
        .forEach((box) => box.classList.add("extra"));
      return same("Zähle die hellen Kästchen oben.");
    }
    showAll(".bar-value");
    return same(
      q.kind === "sum" ? "Rechne die Zahlen über den Säulen zusammen." : "Die Zahlen über den Säulen helfen dir.",
    );
  }

  window.WieseMath = { instruction, markup, renderBuilt, reveal, hint };
})();
