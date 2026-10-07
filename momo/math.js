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
  const SIDES = {
    links: ["⬅️ Links", "Links"],
    gleich: ["Gleich viele", "Gleich viele"],
    rechts: ["Rechts ➡️", "Rechts"],
  };
  // Pips of a die on a 3×3 grid.
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

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
  function numberButtons(choices, labels = {}, shown = {}, cls = "") {
    return `<div class="answer-choices">${choices.map((value) => `<button class="letter-button number-button${cls ? ` ${cls}` : ""}" data-answer="${value}" aria-label="${labels[value] || value}">${shown[value] || value}</button>`).join("")}</div>`;
  }
  // Coins (cent and euro) and notes (from 5 €), not real images of money.
  function coin(value, unit) {
    if (unit === "€" && value >= 5) return `<span class="note n${value}">${value} €</span>`;
    return `<span class="coin ${unit === "€" ? "euro" : `c${value}`}">${value}<small>${unit}</small></span>`;
  }
  // A dot field: rows of equal length, a small gap after five; row sums as help.
  function dotField(rows, cols) {
    return `<div class="dot-field" role="img" aria-label="Punktefeld">${Array.from({ length: rows }, (_, r) => `<span class="dot-row">${'<span class="dot"></span>'.repeat(cols)}<span class="row-sum" hidden>${(r + 1) * cols}</span></span>`).join("")}</div>`;
  }
  // Analog clock: short hand hours, long hand minutes; minute marks as help.
  function clockFace(hour, minute) {
    const at = (angle, radius) => [
      (Math.sin((angle * Math.PI) / 180) * radius).toFixed(1),
      (-Math.cos((angle * Math.PI) / 180) * radius).toFixed(1),
    ];
    let marks = "";
    for (let i = 0; i < 60; i++) {
      const [x1, y1] = at(i * 6, i % 5 ? 92 : 86);
      const [x2, y2] = at(i * 6, 98);
      marks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${i % 5 ? "minute-mark" : "hour-mark"}"/>`;
    }
    const numbers = Array.from({ length: 12 }, (_, i) => {
      const [x, y] = at((i + 1) * 30, 72);
      return `<text x="${x}" y="${y}" class="clock-number">${i + 1}</text>`;
    }).join("");
    const minutes = Array.from({ length: 12 }, (_, i) => {
      const [x, y] = at(i * 30, 114);
      return `<text x="${x}" y="${y}" class="clock-minute">${i * 5}</text>`;
    }).join("");
    const [hx, hy] = at((hour % 12) * 30 + minute / 2, 48);
    const [mx, my] = at(minute * 6, 80);
    return `<svg class="clock" viewBox="-128 -128 256 256" role="img" aria-label="Uhr"><circle r="100" class="clock-face"/>${marks}${numbers}${minutes}<line x1="0" y1="0" x2="${hx}" y2="${hy}" class="hand hour-hand"/><line x1="0" y1="0" x2="${mx}" y2="${my}" class="hand minute-hand"/><circle r="6" class="clock-pin"/></svg><p class="clock-legend" hidden><span class="hour-key">kurzer Zeiger: Stunde</span> <span class="minute-key">langer Zeiger: Minuten</span></p>`;
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
  // Ten frames (2 rows of 5) filled row by row; full rows get a running total as help.
  function frames(count, filled) {
    const frame = (f) => {
      let cells = "";
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 5; i++)
          cells += `<span class="cell${f * 10 + row * 5 + i < filled ? " full" : ""}"></span>`;
        const total = f * 10 + row * 5 + 5;
        cells += `<span class="row-label">${total <= filled ? total : ""}</span>`;
      }
      return `<span class="frame">${cells}</span>`;
    };
    return `<div class="frames" role="img" aria-label="${count === 1 ? "Zehnerfeld" : "Zwanzigerfeld"}">${Array.from({ length: count }, (_, f) => frame(f)).join("")}</div>`;
  }
  function die(n) {
    return `<span class="die-wrap"><span class="die" role="img" aria-label="Würfel">${Array.from({ length: 9 }, (_, i) => `<span class="${PIPS[n].includes(i) ? "pip" : ""}"></span>`).join("")}</span><span class="die-label" hidden>${n}</span></span>`;
  }
  // Tally marks: bundles of five (four strokes, one across), then single strokes.
  function tally(n) {
    const stroke = (x) => `<line x1="${x}" y1="6" x2="${x}" y2="46"/>`;
    const bundles = Math.floor(n / 5);
    const groups = Array.from(
      { length: bundles },
      (_, i) =>
        `<span class="tally-group"><svg viewBox="0 0 44 52" class="tally">${[8, 16, 24, 32].map(stroke).join("")}<line x1="2" y1="40" x2="40" y2="12"/></svg><span class="tally-label" hidden>${(i + 1) * 5}</span></span>`,
    );
    if (n % 5)
      groups.push(
        `<span class="tally-group"><svg viewBox="0 0 ${8 * (n % 5) + 8} 52" class="tally" style="width:${8 * (n % 5) + 8}px">${Array.from({ length: n % 5 }, (_, i) => stroke(8 + 8 * i)).join("")}</svg><span class="tally-label" hidden></span></span>`,
      );
    return `<div class="tally-row" role="img" aria-label="Strichliste">${groups.join("")}</div>`;
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
      case "count":
        return same(
          q.show === "missing"
            ? "Wie viele fehlen bis 20?"
            : q.show === "dice"
              ? "Wie viele Augen sind es zusammen?"
              : "Wie viele sind es?",
        );
      case "more":
        return same(
          { more: "Wo sind mehr?", fewer: "Wo sind weniger?", diff: `Wie viele sind ${q.bigger} mehr?` }[q.kind],
        );
      case "venn":
        return same(q.ask === "place" ? `Wohin gehört ${q.item.article} ${q.item.word}?` : q.question);
      case "calc":
        return same(
          q.op === "fillUp"
            ? "Wie viel fehlt bis zum vollen Zehner?"
            : q.op === "fillDown"
              ? "Wie viel musst du wegnehmen bis zum vollen Zehner?"
              : "Rechne aus.",
        );
      case "cross":
        return same(q.op.startsWith("step") ? "Rechne in Schritten. Was fehlt?" : "Rechne aus.");
      case "times":
        return same(
          { count: "Wie viele Punkte sind es?", task: "Welche Malaufgabe passt zum Punktefeld?" }[q.ask] ||
            "Rechne aus.",
        );
      case "money":
        if (q.ask === "count") return same("Wie viel Geld ist das?");
        return { text: q.question, speech: q.questionSpeech };
      default:
        return { text: q.question, speech: q.questionSpeech || q.question };
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
      case "cross": {
        const task = q.parts.map((part) => (part === null ? gap : part)).join(" ");
        const [first] = q.steps;
        const sign = q.minus ? "−" : "+";
        const low = Math.min(q.a, q.result);
        const high = Math.max(q.a, q.result);
        const from = Math.floor(low / 10) * 10;
        const to = Math.min(100, Math.max(from + 20, Math.ceil(high / 10) * 10));
        const tens = [];
        for (let n = from; n <= to; n += 10) tens.push(n);
        // Two-digit numbers: the first step (tens) as help; else the number line.
        const help = q.op.startsWith("N") && q.op.endsWith("N")
          ? `<p>${q.a} ${sign} ${Math.abs(first)} = ${q.a + first}</p>`
          : numberLine({ from, to, ticks: to - from > 50 ? 5 : 1, labels: tens, marker: q.a });
        return `<div class="equation">${task}</div>${listen("Aufgabe anhören")}${numberButtons(q.choices)}<div class="math-help" id="math-help" hidden>${help}</div>`;
      }
      case "times": {
        if (q.ask === "count" || q.ask === "task")
          return `${dotField(q.rows, q.cols)}${numberButtons(q.choices, q.say || {}, {}, q.ask === "task" ? "expression" : "")}`;
        const known = q.known ? `<p class="equation known">${q.known.text}</p>` : "";
        return `${known}<div class="equation">${q.rows} · ${q.cols} = ${gap}</div>${listen("Aufgabe anhören")}${numberButtons(q.choices)}<div class="math-help" id="math-help" hidden>${dotField(q.rows, q.cols)}</div>`;
      }
      case "money": {
        const unitWord = q.unit === "€" ? "Euro" : "Cent";
        const labelled = (choices) =>
          numberButtons(
            choices,
            Object.fromEntries(choices.map((value) => [value, `${value} ${unitWord}`])),
            Object.fromEntries(choices.map((value) => [value, `${value} ${q.unit}`])),
            "money-answer",
          );
        const item = (price) =>
          `<div class="shop-item"><span class="shop-icon" aria-hidden="true">${q.item.icon}</span><span class="price-tag">${price} ${q.unit}</span></div>`;
        if (q.ask === "count") {
          // Help: the same money sorted from big to small, with running totals.
          let sum = 0;
          const sorted = [...q.coins]
            .sort((x, y) => y - x)
            .map((value) => `<span class="money-step">${coin(value, q.unit)}<span>${(sum += value)}</span></span>`)
            .join("");
          return `<div class="purse" role="img" aria-label="Geld">${q.coins.map((value) => coin(value, q.unit)).join("")}</div><div class="math-help money-help" id="math-help" hidden>${sorted}</div>${labelled(q.choices)}`;
        }
        if (q.ask === "pay")
          return `${item(q.price)}<div class="coin-sets">${q.sets.map((set, i) => `<button class="coin-set" data-answer="${set.id}" aria-label="Möglichkeit ${i + 1}: ${set.coins.join(" + ")} ${unitWord}">${set.coins.map((value) => coin(value, q.unit)).join("")}<span class="set-total" hidden>= ${set.total} ${q.unit}</span></button>`).join("")}</div>`;
        const tens = [];
        const from = Math.floor(q.price / 10) * 10;
        for (let n = from; n <= q.paid; n += 10) tens.push(n);
        return `${item(q.price)}<div class="purse paid" role="img" aria-label="Bezahlt">${q.paid === 100 ? coin(1, "€") : coin(50, "ct")}</div>${listen("Aufgabe anhören")}${labelled(q.choices)}<div class="math-help" id="math-help" hidden>${numberLine({ from, to: q.paid, ticks: q.paid - from > 50 ? 5 : 1, labels: tens, marker: q.price })}</div>`;
      }
      case "clock":
        return `${clockFace(q.hour, q.minute)}${numberButtons(q.choices, q.say, {}, "word-answer")}`;
      case "count": {
        const shown =
          q.show === "dice"
            ? `<div class="dice">${q.dice.map(die).join("")}</div>`
            : q.show === "tally"
              ? tally(q.number)
              : q.show === "scatter"
                ? `<div class="scatter" role="img" aria-label="Durcheinander">${q.points.map((point, i) => `<span class="scatter-item" style="left:${point.x}%;top:${point.y}%">${q.icon}<span class="item-n" hidden>${i + 1}</span></span>`).join("")}</div>`
                : frames(q.frames, q.number);
        return `${shown}${numberButtons(q.choices)}`;
      }
      case "more": {
        const side = (name, count) =>
          `<div class="set-box${q.bigSide === name ? " big" : ""}" data-side="${name}"><span class="set-head">${SIDES[name][1]}</span><span class="set-items" role="img" aria-label="${SIDES[name][1]}">${Array.from({ length: count }, () => `<span class="set-item">${q.icon}</span>`).join("")}</span><span class="set-count" hidden>${count}</span></div>`;
        const answers =
          q.kind === "diff"
            ? numberButtons(q.choices)
            : `<div class="answer-choices">${q.choices.map((choice) => `<button class="letter-button side-button" data-answer="${choice}" aria-label="${SIDES[choice][1]}">${SIDES[choice][0]}</button>`).join("")}</div>`;
        return `<div class="set-compare">${side("links", q.left)}${side("rechts", q.right)}</div>${answers}`;
      }
      case "venn": {
        // Two overlapping rings (or one) in a frame; the band below is "outside".
        const one = q.rings.length === 1;
        const [ringA, ringB] = q.rings;
        const zones = one ? ["a", "none"] : ["a", "both", "b", "none"];
        const caption = {
          a: one ? "drin" : `nur ${ringA.label}`,
          b: `nur ${ringB?.label}`,
          both: "beide",
          none: "draußen",
        };
        const aria = {
          a: one ? `In den Kreis ${ringA.label}` : `Nur in den Kreis ${ringA.label}`,
          b: `Nur in den Kreis ${ringB?.label}`,
          both: "In die Mitte, in beide Kreise",
          none: "Nach draußen, in keinen Kreis",
        };
        const place = q.ask === "place";
        const zone = (name) => {
          const inner = `<span class="zone-items">${q.placed
            .filter((x) => x.zone === name)
            .map((x) => `<span class="venn-thing" title="${x.word}">${x.icon}</span>`)
            .join("")}</span><span class="zone-caption"${name === "none" ? "" : " hidden"}>${caption[name]}</span>`;
          return place
            ? `<button class="venn-zone zone-${name}" data-answer="${name}" aria-label="${aria[name]}">${inner}</button>`
            : `<div class="venn-zone zone-${name}">${inner}</div>`;
        };
        const diagram = `<div class="venn${one ? " one" : ""}">${q.rings.map((ring, i) => `<span class="venn-ring ring-${i}"></span><span class="venn-label label-${i}">${ring.label}</span>`).join("")}${zones.map(zone).join("")}</div>`;
        return place
          ? `<div class="venn-target" aria-hidden="true">${q.item.icon}</div>${diagram}`
          : `${diagram}${numberButtons(q.choices)}`;
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
    if (q.mode === "venn" && q.ask === "place") {
      root
        .querySelector(`[data-answer="${value}"] .zone-items`)
        .insertAdjacentHTML("beforeend", `<span class="venn-thing found">${q.item.icon}</span>`);
      root.querySelector(".venn-target").classList.add("placed");
      return;
    }
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
    if (q.mode === "venn" && q.ask === "place") return same("Da passt es nicht hin.");
    if (SIDES[picked]) return same(`${SIDES[picked][1]} stimmt nicht.`);
    if (q.mode === "money" && q.ask === "pay") return same("Das passt nicht genau.");
    if (q.mode === "money")
      return {
        text: `${picked} ${q.unit} passt nicht.`,
        speech: `${capitalize(W(Number(picked)))} ${q.unit === "€" ? "Euro" : "Cent"} passt nicht.`,
      };
    if (q.say?.[picked]) return { text: `${picked} passt nicht.`, speech: `${capitalize(q.say[picked])} passt nicht.` };
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
      case "count":
        return countTip(q, n, { find, showAll });
      case "more":
        return moreTip(q, n, { find, showAll });
      case "venn":
        return vennTip(q, n, { find, showAll });
      case "cross":
        return crossTip(q, n, { help });
      case "times":
        return timesTip(q, n, { showAll, help });
      case "money":
        return moneyTip(q, n, { showAll, help });
      case "clock":
        return clockTip(q, n, { find, showAll });
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

  function crossTip(q, n, { help }) {
    const twoDigit = q.op === "N+N" || q.op === "N-N";
    if (n === 1)
      return same(
        twoDigit
          ? "Rechne erst mit den Zehnern, dann mit den Einern."
          : q.minus
            ? "Rechne erst zurück bis zum vollen Zehner, dann weiter."
            : "Rechne erst bis zum vollen Zehner, dann weiter.",
      );
    help();
    const [first, second] = q.steps.map(Math.abs);
    const sign = q.minus ? "−" : "+";
    const word = q.minus ? "minus" : "plus";
    const middle = q.a + q.steps[0];
    return {
      text: `Erst ${q.a} ${sign} ${first} = ${middle}. Dann noch ${second} ${q.minus ? "weg" : "dazu"}.`,
      speech: `Erst ${W(q.a)} ${word} ${W(first)} ist ${W(middle)}. Dann noch ${W(second)} ${q.minus ? "weg" : "dazu"}.`,
    };
  }
  function timesTip(q, n, { showAll, help }) {
    const k = q.cols;
    if (n === 1) {
      if (q.ask === "count") return same(`Zähle in Reihen: Jede Reihe hat ${k}.`);
      if (q.ask === "task") return same("Wie viele Reihen sind es? Wie viele Punkte hat eine Reihe?");
      if (q.ask === "neighbor")
        return {
          text: `${q.rows} · ${k} ist eine Reihe ${q.rows > q.core ? "mehr" : "weniger"} als ${q.core} · ${k}.`,
          speech: `${capitalize(W(q.rows))} mal ${W(k)} ist eine Reihe ${q.rows > q.core ? "mehr" : "weniger"} als ${W(q.core)} mal ${W(k)}.`,
        };
      if (q.ask === "swap") return same("Tauschaufgaben haben das gleiche Ergebnis.");
      return same(`Zähle in ${k}er-Schritten: ${k}, ${2 * k}, ${3 * k} …`);
    }
    if (q.ask !== "count" && q.ask !== "task") help();
    showAll(".row-sum");
    return same(
      q.ask === "task"
        ? `Zähle die Reihen. Jede Reihe hat ${k} Punkte.`
        : "Die Zahlen am Rand zählen die Reihen zusammen.",
    );
  }
  function moneyTip(q, n, { showAll, help }) {
    if (q.ask === "count") {
      if (n === 1) return same("Fang beim größten Geld an und zähle weiter.");
      help();
      return same("Hier ist das Geld sortiert. Zähle vom größten aus weiter.");
    }
    if (q.ask === "pay") {
      if (n === 1) return same("Rechne bei jeder Reihe das Geld zusammen.");
      showAll(".set-total");
      return same("Welche Reihe ergibt genau den Preis?");
    }
    if (n === 1)
      return {
        text: `Wie viel fehlt von ${q.price} bis ${q.paid}?`,
        speech: `Wie viel fehlt von ${W(q.price)} bis ${W(q.paid)}?`,
      };
    help();
    return same("Zähle auf dem Zahlenstrahl weiter.");
  }
  function clockTip(q, n, { find, showAll }) {
    if (n === 1)
      return same(
        q.kind === "half"
          ? "Halb heißt: noch eine halbe Stunde bis zur nächsten vollen Stunde."
          : "Der kurze Zeiger zeigt die Stunde. Der lange Zeiger zeigt die Minuten.",
      );
    find(".clock").classList.add("helping");
    showAll(".clock-legend");
    if (n === 2) return same("Die kleinen Zahlen außen zeigen die Minuten.");
    const next = (q.hour % 12) + 1;
    return q.minute === 0
      ? { text: `Der kurze Zeiger zeigt genau auf die ${q.hour}.`, speech: `Der kurze Zeiger zeigt genau auf die ${W(q.hour)}.` }
      : {
          text: `Der kurze Zeiger steht zwischen ${q.hour} und ${next}.`,
          speech: `Der kurze Zeiger steht zwischen ${W(q.hour)} und ${W(next)}.`,
        };
  }
  function countTip(q, n, { find, showAll }) {
    if (n === 1)
      return same(
        {
          frame: "Eine volle Reihe hat 5. Ein volles Zehnerfeld hat 10.",
          missing: "Wie viele Kästchen sind noch leer?",
          dice: "Zähle die Augen von beiden Würfeln.",
          tally: "Ein Bündel mit Querstrich sind 5 Striche. Zähle in Fünfern: 5, 10, 15 …",
          scatter: "Zähle langsam und zeige auf jedes Ding.",
        }[q.show],
      );
    if (q.show === "frame") {
      find(".frames").classList.add("helping");
      return same("Zähle in Fünfern und dann weiter.");
    }
    if (q.show === "missing") {
      find(".frames").classList.add("lit");
      return same("Zähle die leeren Kästchen.");
    }
    if (q.show === "dice") {
      showAll(".die-label");
      return same("Rechne: erster Würfel plus zweiter Würfel.");
    }
    if (q.show === "tally") {
      showAll(".tally-label");
      return same("Die Zahlen zeigen, wie viele es bis dahin sind. Zähle die einzelnen Striche dazu.");
    }
    showAll(".item-n");
    return same("Die Zahlen helfen beim Zählen.");
  }
  function moreTip(q, n, { find, showAll }) {
    if (n === 1)
      return same(
        q.kind === "diff"
          ? "Bilde Paare: immer eins links und eins rechts. Wie viele bleiben übrig?"
          : q.bigSide
            ? "Achtung: Groß heißt nicht viel. Zähle genau!"
            : "Zähle beide Seiten genau.",
      );
    // Pairs: the things without a partner light up.
    if (q.bigger !== "gleich")
      [...find(`[data-side="${q.bigger}"]`).querySelectorAll(".set-item")]
        .slice(Math.min(q.left, q.right))
        .forEach((item) => item.classList.add("extra"));
    if (n >= 3) {
      showAll(".set-count");
      return same("Schau auf die Zahlen unter den Seiten.");
    }
    return same(
      q.bigger === "gleich"
        ? "Bilde Paare: Bleibt eins übrig?"
        : "Bilde Paare: Die leuchtenden Dinge haben keinen Partner.",
    );
  }
  function vennTip(q, n, { find, showAll }) {
    const ringB = q.rings[1];
    if (q.ask === "place") {
      if (n === 1) return same(q.rings.map((ring) => ring.ask).join(" "));
      showAll(".zone-caption");
      if (n === 2)
        return same(
          ringB
            ? "Passt es zu beiden, kommt es in die Mitte. Passt es zu keinem, kommt es nach draußen."
            : "Passt es, kommt es in den Kreis. Sonst kommt es nach draußen.",
        );
      return { text: q.explain.text, speech: q.explain.speech };
    }
    const ring = q.rings[q.ring];
    const side = q.ring === 0 ? "a" : "b";
    if (n === 1)
      return same(
        {
          ring: `Zähle alles im Kreis „${ring.label}“ – auch die Dinge in der Mitte!`,
          only: "Nur in einem Kreis heißt: nicht in der Mitte.",
          both: "Die Mitte gehört zu beiden Kreisen.",
          none: "In keinem Kreis heißt: draußen.",
        }[q.ask],
      );
    const lit = { ring: [side, "both"], only: [side], both: ["both"], none: ["none"] }[q.ask];
    lit.forEach((zone) => find(`.zone-${zone}`).classList.add("lit"));
    return same("Zähle die Dinge in den hellen Feldern.");
  }

  window.WieseMath = { instruction, markup, renderBuilt, reveal, hint };
})();
