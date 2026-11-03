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
    const show = (value) => (/^\d+$/.test(value) ? C.formatNumber(Number(value)) : value);
    const wide = choices.some((value) => /^\d{5,}$/.test(value));
    const classes = [cls, wide && !cls.includes("big-number") ? "big-number" : ""].filter(Boolean).join(" ");
    return `<div class="answer-choices">${choices.map((value) => `<button class="letter-button number-button${classes ? ` ${classes}` : ""}" data-answer="${value}" aria-label="${labels[value] || show(value)}">${shown[value] || show(value)}</button>`).join("")}</div>`;
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

  /* ---------- Big numbers ---------- */
  const P = C.PLACES;
  const F = C.formatNumber;
  // Shape colours (top, front, side, line) as in the tens and ones blocks:
  // cubes orange, rods blue, plates green – the pattern repeats every three places.
  const HUES = [
    ["#f7c493", "#f0a35e", "#d98a45", "#a8652c"],
    ["#a9c9e6", "#6fa3cf", "#4f84b2", "#2f5f88"],
    ["#c4e2ca", "#8cc49a", "#6aa97a", "#3f7a4f"],
  ];
  /*
   * A place as an isometric block: cube (1), rod (10 cubes), plate (10 × 10).
   * The cube of a bigger family (Tausender, Million) is made of 10 × 10 × 10
   * small cubes, so its faces carry a 10 × 10 grid.
   */
  function unitSvg(index, width) {
    const shape = index % 3;
    const [a, b, c] = [[1, 1, 1], [10, 1, 1], [10, 10, 1]][shape];
    const [top, front, side, line] = HUES[shape];
    const fine = shape === 0 && index >= 3;
    const at = (x, y, z) => [(x - y) * 0.866, (x + y) * 0.5 - z];
    const pt = (x, y, z) => at(x, y, z).map((v) => v.toFixed(3)).join(",");
    const face = (points, fill) =>
      `<polygon points="${points.map((q) => pt(...q)).join(" ")}" fill="${fill}" stroke="${line}" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    const seg = (p1, p2) =>
      `<line x1="${at(...p1)[0].toFixed(3)}" y1="${at(...p1)[1].toFixed(3)}" x2="${at(...p2)[0].toFixed(3)}" y2="${at(...p2)[1].toFixed(3)}" vector-effect="non-scaling-stroke"/>`;
    const steps = (length) => (fine ? Array.from({ length: 9 }, (_, i) => (i + 1) / 10) : Array.from({ length: length - 1 }, (_, i) => i + 1));
    const grid = [
      ...steps(a).map((i) => seg([i, 0, c], [i, b, c])),
      ...steps(b).map((j) => seg([0, j, c], [a, j, c])),
      ...steps(a).map((i) => seg([i, b, 0], [i, b, c])),
      ...steps(c).map((k) => seg([0, b, k], [a, b, k])),
      ...steps(b).map((j) => seg([a, j, 0], [a, j, c])),
      ...steps(c).map((k) => seg([a, 0, k], [a, b, k])),
    ].join("");
    const minX = -b * 0.866;
    const maxX = a * 0.866;
    const minY = -c;
    const maxY = (a + b) * 0.5;
    const box = `${(minX - 0.1).toFixed(2)} ${(minY - 0.1).toFixed(2)} ${(maxX - minX + 0.2).toFixed(2)} ${(maxY - minY + 0.2).toFixed(2)}`;
    return `<svg class="unit-svg" viewBox="${box}" width="${width}" aria-hidden="true">${face([[0, 0, c], [a, 0, c], [a, b, c], [0, b, c]], top)}${face([[0, b, 0], [a, b, 0], [a, b, c], [0, b, c]], front)}${face([[a, 0, 0], [a, b, 0], [a, b, c], [a, 0, c]], side)}<g stroke="${line}" stroke-width="${fine ? 0.4 : 0.8}" stroke-opacity="${fine ? 0.45 : 0.7}">${grid}</g></svg>`;
  }
  // Picture width: small cubes small, the cube of a family bigger.
  const unitWidth = (index, small = false) =>
    index % 3 === 0 ? (index >= 3 ? (small ? 40 : 58) : small ? 18 : 26) : small ? 62 : 84;
  // Steps from one place to the next: picture and name, "×10" and values as help.
  function ladder(from, to) {
    const parts = [];
    for (let i = from; i <= to; i++) {
      if (i > from) parts.push('<span class="ladder-arrow" hidden>×10</span>');
      parts.push(
        `<span class="ladder-step" data-step-place="${i}">${unitSvg(i, unitWidth(i, true))}<span class="ladder-name">${P[i].name}</span><span class="ladder-value" hidden>${F(P[i].value)}</span></span>`,
      );
    }
    return `<div class="place-ladder">${parts.join("")}</div>`;
  }
  /*
   * Place-value chart, highest place left. Dots ("Plättchen") show the
   * digits; the digit row is help. A thick line separates the groups of three.
   */
  function placeTable(q, { dots = true, digits = false } = {}) {
    const columns = Array.from({ length: q.places }, (_, i) => q.places - 1 - i);
    const cell = (i, inner, cls) =>
      `<span class="pt-cell ${cls} shape${i % 3}${i % 3 === 2 && i < q.places - 1 ? " group-start" : ""}${q.digits[i] === 0 ? " zero" : ""}" data-col="${i}">${inner}</span>`;
    return `<div class="place-table" role="img" aria-label="Stellentafel" style="--places:${q.places}">${columns.map((i) => cell(i, P[i].id, "pt-head")).join("")}${dots ? columns.map((i) => cell(i, '<span class="pt-dot"></span>'.repeat(q.digits[i] || 0), "pt-dots")).join("") : ""}${columns.map((i) => cell(i, i < q.digits.length ? q.digits[i] : "", "pt-digit").replace("<span", digits ? "<span" : "<span hidden")).join("")}</div>`;
  }
  const bigButtons = (choices) =>
    numberButtons(
      choices,
      Object.fromEntries(choices.map((x) => [x, F(Number(x))])),
      Object.fromEntries(choices.map((x) => [x, F(Number(x))])),
      "big-number",
    );
  function tenfoldMarkup(q) {
    if (q.kind === "count") {
      const big = P[q.big];
      const small = P[q.small];
      return `<div class="unit-equation" role="img" aria-label="${big.one} ist wie viele ${small.plural}?"><span class="unit-pic">${unitSvg(q.big, unitWidth(q.big))}<small>1 ${big.name}</small></span><span class="unit-eq">=</span><span class="math-gap" data-reveal>?</span><span class="unit-eq">×</span><span class="unit-pic">${unitSvg(q.small, unitWidth(q.small))}<small>${small.name}</small></span></div><div class="math-help" id="math-help" hidden>${ladder(q.small, q.big)}</div>${bigButtons(q.choices)}`;
    }
    const unit = P[q.from];
    const pieces = Array.from({ length: 10 }, () => unitSvg(q.from, unitWidth(q.from, true))).join("");
    const piece = unitWidth(q.from, true);
    const result =
      q.kind === "name"
        ? `10 ${unit.plural} = 1 <span class="math-gap word-gap" data-reveal>?</span>`
        : `10 ${unit.plural} = <span class="math-gap" data-reveal>?</span>`;
    const buttons =
      q.kind === "name"
        ? `<div class="answer-choices">${q.choices.map((x) => `<button class="letter-button unit-button" data-answer="${x}">${x}</button>`).join("")}</div>`
        : bigButtons(q.choices);
    return `<div class="ten-pieces shape${q.from % 3}" style="--piece:${piece}px" role="img" aria-label="10 ${unit.plural}">${pieces}</div><div class="equation unit-result">${result}</div><div class="math-help" id="math-help" hidden>${ladder(Math.max(0, q.from - 1), Math.min(6, q.from + 1))}</div>${buttons}`;
  }
  function placetableMarkup(q, listen) {
    const help = (inner) => `<div class="math-help" id="math-help" hidden>${inner}</div>`;
    switch (q.kind) {
      case "digit":
        return `<div class="number-target big-target" aria-label="Zahl ${q.shown}">${q.shown}</div>${listen("Zahl anhören")}${numberButtons(q.choices)}${help(placeTable(q, { dots: false, digits: true }))}`;
      case "split": {
        const terms = q.parts.map((x, i) => (i === q.gap ? gap : F(x)));
        return `<div class="equation big-equation">${q.shown} = ${terms.join(" + ")}</div>${listen("Anhören")}${bigButtons(q.choices)}${help(placeTable(q, { digits: true }))}`;
      }
      case "compose":
        return `<div class="place-sum big-sum">${q.chips.map((x) => `<span class="place-chip big-chip">${x.replace(/^(\d+)/, "<strong>$1</strong>")}</span>`).join("")}</div>${listen("Anhören")}${bigButtons(q.choices)}${help(placeTable(q, { digits: true }))}`;
      default:
        return `${placeTable(q)}<p class="math-help" id="math-help" hidden></p>${bigButtons(q.choices)}`;
    }
  }
  /*
   * Laying numbers: one column per place with + and − below. The dots are
   * updated in place by renderLaid, so taps on the buttons are never lost.
   */
  function layMarkup(q, listen) {
    const target = q.delta
      ? ""
      : `<div class="number-target big-target${q.hidden ? " no-picture" : ""}" aria-hidden="true">${q.hidden ? "👂" : q.shown}</div>`;
    const columns = Array.from({ length: q.places }, (_, i) => q.places - 1 - i);
    const cls = (i) => `pt-cell shape${i % 3}${i % 3 === 2 && i < q.places - 1 ? " group-start" : ""}`;
    const buttons = (i) =>
      `<span class="${cls(i)} pt-buttons"><button class="step-button lay-step" data-lay="${i}" data-step="1" aria-label="${P[i].one} dazulegen">+</button><button class="step-button lay-step" data-lay="${i}" data-step="-1" aria-label="${P[i].one} wegnehmen">−</button></span>`;
    const table = `<div class="place-table lay-table" style="--places:${q.places}">${columns.map((i) => `<span class="${cls(i)} pt-head">${P[i].id}</span>`).join("")}${columns.map((i) => `<span class="${cls(i)} pt-dots" id="lay-dots-${i}"></span>`).join("")}${columns.map((i) => `<span class="${cls(i)} pt-digit lay-digit" id="lay-digit-${i}" hidden></span>`).join("")}${columns.map(buttons).join("")}</div>`;
    return `${target}${q.speech ? listen("Zahl anhören") : ""}${table}<p class="lay-note" id="lay-note" role="status"></p><p class="math-help" id="math-help" hidden></p><button id="build-done" class="button primary build-done">✓ Fertig</button>`;
  }
  function renderLaid(root, laid, answered, places) {
    const value = C.layValue(laid);
    const length = String(value).length;
    for (let i = 0; i < places; i++) {
      root.querySelector(`#lay-dots-${i}`).innerHTML = '<span class="pt-dot"></span>'.repeat(laid[i] || 0);
      // Leading columns stay empty, inner empty places show their 0.
      root.querySelector(`#lay-digit-${i}`).textContent = value && i < length ? laid[i] || 0 : "";
    }
    for (const button of root.querySelectorAll("[data-lay]"))
      button.disabled =
        answered || !C.layStep(laid, Number(button.dataset.lay), Number(button.dataset.step), places);
  }
  // What Momo says when ten dots were bundled or one was unbundled.
  function layNote(events) {
    const first = events[0];
    if (first.type === "bundle") {
      const from = P[first.from];
      const to = P[first.from + 1];
      return {
        text: `10 ${from.plural} → 1 ${to.name}. Momo bündelt!`,
        speech: `Zehn ${from.plural} sind ${to.one}. Momo bündelt.`,
        column: first.from + 1,
      };
    }
    const from = P[first.from];
    const to = P[first.from - 1];
    return {
      text: `1 ${from.name} → 10 ${to.plural}. Momo tauscht.`,
      speech: `${capitalize(from.one)} wird zu zehn ${to.dativePlural}. Momo tauscht.`,
      column: events.at(-1).from - 1,
    };
  }
  function layTip(q, n, { showAll, help, built }) {
    const laid = Array.from({ length: q.places }, (_, i) => built?.[i] || 0);
    const off = [...laid.keys()].reverse().find((i) => laid[i] !== (q.target[i] || 0));
    if (n === 1) {
      if (q.delta) {
        const amount = Math.abs(q.delta);
        const place = P[q.at];
        const way = q.delta > 0 ? "dazu" : "weg";
        return {
          text: `${F(amount)} ${q.delta > 0 ? "mehr" : "weniger"} heißt: 1 Plättchen bei den ${place.dativePlural} ${way}. Liegen dort 10, bündelt Momo.`,
          speech: `${capitalize(W(amount))} ${q.delta > 0 ? "mehr" : "weniger"} heißt: ein Plättchen bei den ${place.dativePlural} ${way}. Liegen dort zehn, bündelt Momo.`,
        };
      }
      return same("Das passt noch nicht. Vergleiche Spalte für Spalte: Stimmt jede Stelle?");
    }
    if (n === 2 && off != null) {
      showAll("#task-area .lay-digit");
      return same(
        `Unter jeder Spalte steht jetzt, wie viele es sind. Bei den ${P[off].dativePlural} sind es noch zu ${laid[off] < (q.target[off] || 0) ? "wenige" : "viele"}.`,
      );
    }
    showAll("#task-area .lay-digit");
    const explain = C.placesExplain(q.number, q.target.length);
    help(explain.text);
    return { text: "Schau: So viele Plättchen gehören in jede Spalte.", speech: explain.speech };
  }
  function tenfoldTip(q, n, { showAll, help }) {
    if (q.kind === "count") {
      if (n === 1) return same("Jede Stelle ist 10-mal so groß wie die davor. Zähle die Schritte.");
      help();
      showAll("#math-help .ladder-arrow");
      if (n === 2) return same("Jeder Pfeil heißt: mal 10. Wie oft musst du mal 10 rechnen?");
      showAll("#math-help .ladder-value");
      return same("Schau: Unter jeder Stufe steht jetzt ihr Wert.");
    }
    if (n === 1)
      return q.kind === "name"
        ? same("Die Namen wiederholen sich: Einer, Zehner, Hunderter. Dann Tausender, Zehntausender, Hunderttausender.")
        : same("10 gleiche Teile kann man zu einem großen Teil bündeln.");
    help();
    showAll("#math-help .ladder-arrow");
    if (n === 2) return same(`Schau auf die Treppe: Aus 10 ${P[q.from].dativePlural} wird das nächste Teil.`);
    showAll("#math-help .ladder-value");
    return same("Unter jeder Stufe steht jetzt ihr Wert.");
  }
  function placetableTip(q, n, { find, showAll, help, picked }) {
    const markColumn = (i) =>
      document.querySelectorAll(`#task-area [data-col="${i}"]`).forEach((el) => el.classList.add("asked"));
    if (q.kind === "digit") {
      if (n === 1)
        return same(`Von rechts nach links: ${P.slice(0, q.digits.length).map((x) => x.plural).join(", ")}.`);
      help();
      if (n === 2) return same("Schau in die Stellentafel: Jede Ziffer steht in ihrer Spalte.");
      markColumn(q.at);
      return same(`Die Spalte der ${P[q.at].plural} ist jetzt markiert.`);
    }
    if (q.kind === "split") {
      const other = q.parts.findIndex((_, i) => i !== q.gap);
      const value = q.parts[other];
      const place = String(value).length - 1;
      const digit = value / 10 ** place;
      if (n === 1)
        return {
          text: `Jede Ziffer zählt so viel wie ihre Stelle: ${digit} ${digit === 1 ? P[place].name : P[place].plural} sind ${F(value)}.`,
          speech: `Jede Ziffer zählt so viel wie ihre Stelle: ${countWord(digit)} ${digit === 1 ? P[place].name : P[place].plural} sind ${W(value)}.`,
        };
      help();
      if (n === 2) return same("Schau in die Stellentafel: Welche Ziffer fehlt noch in der Rechnung?");
      markColumn(String(q.parts[q.gap]).length - 1);
      return same("Die fehlende Stelle ist jetzt markiert. Hänge die passenden Nullen an.");
    }
    // read and compose
    if (n === 1) {
      if (picked != null && picked === q.zeroSlip)
        return same("Achtung: Eine leere Stelle schreibt man als 0. Die Null hält den Platz frei.");
      return same(
        q.kind === "read"
          ? "Zähle die Plättchen in jeder Spalte. Jede Spalte ist eine Stelle der Zahl."
          : "Schreib zu jeder Stelle die Ziffer. Wo nichts ist, steht eine 0.",
      );
    }
    if (n === 2) {
      if (q.kind === "read") showAll("#task-area .pt-digit");
      else help();
      return same("Unter jeder Spalte steht jetzt die Ziffer. Lies von links nach rechts, auch die Nullen.");
    }
    if (q.kind === "read") showAll("#task-area .pt-digit");
    else help();
    find(".place-table").classList.add("show-zeros");
    return {
      text: `Die Zahl hat ${q.digits.length} Stellen. Leere Stellen sind Nullen.`,
      speech: `Die Zahl hat ${W(q.digits.length)} Stellen. Leere Stellen sind Nullen.`,
    };
  }

  // "3 H 5 Z 2 E" for comparing bigger numbers place by place.
  function placeDigits(value) {
    const digits = [...String(value)];
    return digits
      .map((d, i) => `<span class="place-chip shape${(digits.length - 1 - i) % 3}"><strong>${d}</strong> ${P[digits.length - 1 - i].id}</span>`)
      .join("");
  }
  /*
   * Written calculation: one column per place (headers E, Z, H …), the sign
   * before the last number, small carries above the line (help) and one box
   * per column for the result, so its length gives nothing away.
   */
  function columnMarkup(q) {
    const width = q.width;
    const cells = (n) => {
      const digits = String(n).padStart(width, " ");
      return [...digits].map((d) => `<span class="col-digit">${d.trim()}</span>`).join("");
    };
    const head = Array.from({ length: width }, (_, i) => `<span class="col-head shape${(width - 1 - i) % 3}">${P[width - 1 - i].id}</span>`).join("");
    const sign = q.op === "+" ? "+" : "−";
    const rows = q.terms
      .map((n, i) => `<span class="col-sign">${i === q.terms.length - 1 ? sign : ""}</span>${cells(n)}`)
      .join("");
    const carries = Array.from({ length: width }, (_, i) => {
      const place = width - 1 - i;
      return `<span class="col-carry" hidden>${q.carries[place] ? q.carries[place] : ""}</span>`;
    }).join("");
    const result = Array.from({ length: width }, (_, i) => `<span class="col-result" data-place="${width - 1 - i}"></span>`).join("");
    const aria = `${q.terms.map(F).join(` ${sign} `)} schriftlich`;
    return `<div class="column-calc" style="--cols:${width}" role="img" aria-label="${aria}"><span class="col-sign"></span>${head}${rows}<span class="col-sign"></span>${carries}<span class="col-line"></span><span class="col-sign"></span>${result}</div>`;
  }

  /* ---------- Instructions ---------- */
  // The number to find is never spoken; numbers in speech are words.
  function instruction(q) {
    switch (q.mode) {
      case "tenfold":
        if (q.kind === "count") return same(`Wie viele ${P[q.small].plural} hat ${P[q.big].one}?`);
        return same(
          q.kind === "name"
            ? `Aus zehn ${P[q.from].dativePlural} wird ein neues Teil. Wie heißt es?`
            : `Momo bündelt zehn ${P[q.from].plural}. Wie viel ist das zusammen?`,
        );
      case "lay": {
        if (!q.delta)
          return same(
            q.hidden
              ? "Hör gut zu und lege die Zahl in die Stellentafel."
              : "Lege die Zahl mit Plättchen in die Stellentafel.",
          );
        const amount = Math.abs(q.delta);
        const way = q.delta > 0 ? "mehr" : "weniger";
        return {
          text: `Hier liegt ${F(q.startNumber)}. Lege ${F(amount)} ${way}!`,
          speech: `Hier liegt ${W(q.startNumber)}. Lege ${W(amount)} ${way}!`,
        };
      }
      case "placetable":
        return same(
          {
            read: "Welche Zahl steht in der Stellentafel?",
            compose: "Welche Zahl ist das?",
            digit: `Wie viele ${P[q.at]?.plural} hat die Zahl?`,
            split: "Zerlege die Zahl. Was fehlt?",
          }[q.kind],
        );
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
        return same(
          [q.rule, q.ask === "place" ? `Wohin gehört ${q.item.article} ${q.item.word}?` : q.question]
            .filter(Boolean)
            .join(" "),
        );
      case "calc": {
        const place = P[Math.log10(q.unit)].name;
        return same(
          q.op === "fillUp"
            ? `Wie viel fehlt bis zum vollen ${place}?`
            : q.op === "fillDown"
              ? `Wie viel musst du wegnehmen bis zum vollen ${place}?`
              : "Rechne aus.",
        );
      }
      case "column":
        return same(q.op === "+" ? "Rechne schriftlich: Was kommt heraus?" : "Rechne schriftlich minus: Was kommt heraus?");
      case "units":
        return same("Rechne um.");
      case "cross":
        return same(q.op.startsWith("step") ? "Rechne in Schritten. Was fehlt?" : "Rechne aus.");
      case "times":
        return same(
          {
            count: "Wie viele Punkte sind es?",
            task: "Welche Malaufgabe passt zum Punktefeld?",
            missing: "Welche Zahl fehlt?",
            remainder: "Teile mit Rest.",
          }[q.ask] || "Rechne aus.",
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
      case "tenfold":
        return tenfoldMarkup(q);
      case "placetable":
        return placetableMarkup(q, listen);
      case "lay":
        return layMarkup(q, listen);
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
        const arrow = `<span class="step-arrow" hidden>${sign(q.step)}${F(Math.abs(q.step))}</span>`;
        const row = q.sequence.map((n, i) => tile(F(n), { hole: i === q.gap })).join(arrow);
        return `<div class="number-row">${row}</div>${listen("Zahlen anhören")}${numberButtons(q.choices)}`;
      }
      case "compare": {
        const side = (part) =>
          `<span class="compare-side"><span class="number-tile wide${q.big ? " big-tile" : ""}">${part.text}</span><span class="compare-help" hidden>${q.big ? placeDigits(part.value) : placeChips(Math.floor(part.value / 10), part.value % 10)}</span></span>`;
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
          ? `${F(q.a)} ${op} ${gap} = ${F(q.result)}`
          : `${F(q.a)} ${op} ${F(q.b)} = ${gap}`;
        // Tens: rods and cubes. Bigger units: the digit of that place, and
        // when filling up a ten frame where every box is one smaller unit.
        const place = P[Math.log10(q.unit)];
        const step = q.unit / 10;
        const help =
          q.unit === 10
            ? q.fill
              ? tenFrame(q.a % 10)
              : `${blocks(Math.floor(q.a / 10), q.a % 10)}<p>${op} ${q.b / 10} Zehner</p>`
            : q.fill
              ? `${tenFrame((q.a % q.unit) / step)}<p>Jedes Kästchen ist ${F(step)}.</p>`
              : `<p>${Math.floor(q.a / q.unit) % 10} ${place.plural} ${op} ${q.b / q.unit} ${place.plural}</p>`;
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
        if (q.parts) {
          const task = q.parts.map((part) => (part === null ? gap : part)).join(" ");
          const help = q.helpText ? `<p>${q.helpText}</p>` : dotField(q.rows, q.cols);
          return `<div class="equation">${task}</div>${listen("Aufgabe anhören")}${numberButtons(q.choices, q.say || {}, {}, q.say ? "expression" : "")}<div class="math-help" id="math-help" hidden>${help}</div>`;
        }
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
      case "column":
        return `${columnMarkup(q)}${listen("Aufgabe anhören")}${numberButtons(q.choices)}<p class="math-help" id="math-help" hidden></p>`;
      case "units":
        return `<div class="equation unit-task"><span>${q.left}</span><span>=</span>${gap}<span>${q.unit}</span></div>${listen("Aufgabe anhören")}${numberButtons(q.choices)}<p class="math-help" id="math-help" hidden></p>`;
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
        const diagram = `<div class="venn${one ? " one" : ""}">${q.rings.map((ring, i) => `<span class="venn-ring ring-${i}"></span><span class="venn-label label-${i}"><span aria-hidden="true">${ring.icon}</span> ${ring.label}</span>`).join("")}${zones.map(zone).join("")}</div>`;
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
    if (q.mode === "column") {
      const digits = [...value].reverse();
      root.querySelectorAll(".col-result").forEach((cell) => {
        cell.textContent = digits[Number(cell.dataset.place)] || "";
        cell.classList.add("found");
      });
      return;
    }
    const target = root.querySelector("[data-reveal]");
    if (!target) return;
    target.textContent = /^\d+$/.test(value) ? F(Number(value)) : value;
    target.classList.add("found");
  }

  /* ---------- Stepped help ---------- */
  function namedPick(q, picked) {
    if (picked == null || q.mode === "build" || q.mode === "lay") return null;
    if (["tenfold", "placetable"].includes(q.mode) && /^\d+$/.test(picked))
      return { text: `${F(Number(picked))} passt nicht.`, speech: `${capitalize(W(Number(picked)))} passt nicht.` };
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
    if (q.mode === "units" && /^\d+$/.test(picked))
      return { text: `${picked} ${q.unit} passt nicht.`, speech: `${capitalize(W(Number(picked)))} passt nicht.` };
    if (/^\d+$/.test(picked))
      return { text: `${F(Number(picked))} passt nicht.`, speech: `${capitalize(W(Number(picked)))} passt nicht.` };
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
    const tip = tipFor(q, n, { find, showAll, help, built, picked });
    const named = namedPick(q, picked);
    return {
      text: [named?.text, tip.text].filter(Boolean).join(" "),
      speech: [named?.speech, tip.speech].filter(Boolean).join(" "),
    };
  }
  function tipFor(q, n, { find, showAll, help, built, picked }) {
    switch (q.mode) {
      case "tenfold":
        return tenfoldTip(q, n, { showAll, help });
      case "placetable":
        return placetableTip(q, n, { find, showAll, help, picked });
      case "lay":
        return layTip(q, n, { showAll, help, built });
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
          text: `Immer ${sign(q.step)} ${F(amount)}.`,
          speech: `Immer ${signWord(q.step)} ${W(amount)}.`,
        };
      }
      case "compare":
        if (q.big) {
          if (n === 1)
            return same(
              "Das Krokodil frisst immer die größere Zahl. Hat eine Zahl mehr Stellen, ist sie größer. Sonst vergleiche von vorne.",
            );
          showAll(".compare-help");
          return same("Vergleiche Stelle für Stelle von vorne. Die erste Stelle, die verschieden ist, entscheidet.");
        }
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
        if (q.unit > 10) return bigCalcTip(q, n, { help });
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
        return q.parts ? timesMoreTip(q, n, { showAll, help }) : timesTip(q, n, { showAll, help });
      case "column":
        return columnTip(q, n, { showAll, help });
      case "units":
        return unitsTip(q, n, { help });
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
  // Calculating with hundreds and thousands: only one place changes.
  function bigCalcTip(q, n, { help }) {
    const place = P[Math.log10(q.unit)];
    const step = q.unit / 10;
    if (n === 1) {
      if (q.op === "fillUp")
        return same(`Wie viel fehlt bis zum nächsten vollen ${place.name}? Zähle in ${F(step)}er-Schritten.`);
      if (q.op === "fillDown") return same(`Nimm so viel weg, dass ein voller ${place.name} übrig bleibt.`);
      if (q.op.startsWith("N")) return same(`Nur die ${place.plural} ändern sich. Die anderen Stellen bleiben gleich.`);
      return {
        text: `Rechne mit den ${place.dativePlural}: ${q.a / q.unit} ${place.plural} ${q.minus ? "minus" : "plus"} ${q.b / q.unit} ${place.plural}.`,
        speech: `Rechne mit den ${place.dativePlural}: ${countWord(q.a / q.unit)} ${place.plural} ${q.minus ? "minus" : "plus"} ${countWord(q.b / q.unit)} ${place.plural}.`,
      };
    }
    help();
    if (q.fill)
      return {
        text: `Jedes Kästchen ist ${F(step)}. ${q.op === "fillUp" ? "Wie viele Kästchen sind noch frei?" : "Wie viele Kästchen sind voll?"}`,
        speech: `Jedes Kästchen ist ${W(step)}. ${q.op === "fillUp" ? "Wie viele Kästchen sind noch frei?" : "Wie viele Kästchen sind voll?"}`,
      };
    return same(`Schau: Rechne nur mit den ${place.dativePlural}.`);
  }
  function timesMoreTip(q, n, { showAll, help }) {
    const [x, , y] = q.parts;
    if (n === 1) {
      if (q.ask === "divide")
        return { text: `Denk an die Malaufgabe: Wie oft passt ${y} in ${x}?`, speech: `Denk an die Malaufgabe: Wie oft passt ${W(y)} in ${W(x)}?` };
      if (q.ask === "missing") return same(`Zähle in ${q.cols}er-Schritten, bis du bei ${q.parts[4]} bist.`);
      if (q.ask === "tens") return same("Rechne zuerst ohne die Null. Dann hänge die Null wieder an.");
      if (q.ask === "split") return same(`Zerlege ${y}: erst die Zehner mal ${x}, dann die Einer mal ${x}.`);
      return same(`Welche Malaufgabe mit ${y} kommt nah an ${x}, aber nicht darüber? Der Rest muss kleiner als ${y} sein.`);
    }
    help();
    if (!q.helpText) {
      showAll(".row-sum");
      return same(`Zähle die Reihen. Jede Reihe hat ${q.cols} Punkte.`);
    }
    return same("Schau auf die Hilfe.");
  }
  function columnTip(q, n, { showAll, help }) {
    if (n === 1)
      return same(
        q.op === "+"
          ? "Fang hinten bei den Einern an. Sind es 10 oder mehr, kommt der Übertrag in die nächste Spalte."
          : "Fang hinten bei den Einern an. Reicht die obere Ziffer nicht, hilft ein Übertrag aus der nächsten Spalte.",
      );
    showAll(".col-carry");
    if (n === 2) return same("Schau: Die kleinen Zahlen über dem Strich sind die Überträge.");
    help(q.first.text);
    return q.first;
  }
  function unitsTip(q, n, { help }) {
    if (n === 1) return q.factQuestion;
    if (n === 2 || !q.steps) {
      help(q.fact.text);
      return { text: `Schau: ${q.fact.text}.`, speech: q.fact.speech };
    }
    help(`${q.fact.text}, also ${q.steps.text}`);
    return { text: `${q.fact.text}. Rechne: ${q.steps.text}.`, speech: `${q.fact.speech} ${q.steps.speech}` };
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

  window.WieseMath = { instruction, markup, renderBuilt, renderLaid, layNote, reveal, hint };
})();
