/* Parents' report: renders core.buildReport() as tiles, charts and lists. */
(function () {
  "use strict";
  const C = window.Wiese;

  // Small DOM builder; all text goes through textContent.
  function el(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") element.className = value;
      else if (key === "text") element.textContent = value;
      else element.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat())
      if (child != null && child !== false)
        element.append(typeof child === "string" ? document.createTextNode(child) : child);
    return element;
  }
  function svg(tag, attrs = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
  }
  const percent = (value) => (value == null ? "–" : `${Math.round(value * 100)} %`);
  const dayLabel = (key, options) =>
    new Date(`${key}T12:00:00`).toLocaleDateString("de-DE", options);
  function since(time, now) {
    if (!time) return "–";
    const days = Math.floor(
      (new Date(C.dayKey(now)) - new Date(C.dayKey(time))) / 86400000,
    );
    return days <= 0 ? "heute" : days === 1 ? "gestern" : `vor ${days} Tagen`;
  }

  /* Stat tile: label · value · delta against the previous week (arrow + words). */
  function tile(label, value, delta, unit) {
    let deltaText = "wie in der Vorwoche";
    let arrow = "→";
    if (delta == null) {
      deltaText = "Vorwoche: keine Daten";
      arrow = "";
    } else if (delta > 0) {
      arrow = "▲";
      deltaText = `${delta} ${unit} mehr als in der Vorwoche`;
    } else if (delta < 0) {
      arrow = "▼";
      deltaText = `${-delta} ${unit} weniger als in der Vorwoche`;
    }
    return el(
      "div",
      { class: "stat-tile" },
      el("span", { class: "stat-label", text: label }),
      el("strong", { class: "stat-value", text: value }),
      el("span", { class: "stat-delta" }, arrow ? el("span", { "aria-hidden": "true", text: `${arrow} ` }) : null, deltaText),
    );
  }

  /* Single-series column chart: tasks per day, with tooltip and table twin. */
  function activityChart(days) {
    const max = Math.max(1, ...days.map((day) => day.tasks));
    const peak = days.reduce((best, day, i) => (day.tasks > days[best].tasks ? i : best), 0);
    const tooltip = el("div", { class: "chart-tooltip", role: "status", hidden: true });
    const columns = days.map((day, i) => {
      const text = `${dayLabel(day.key, { weekday: "short", day: "numeric", month: "numeric" })}: ${day.tasks} ${day.tasks === 1 ? "Aufgabe" : "Aufgaben"}${day.tasks ? `, ${day.ok} beim 1. Versuch richtig` : ""}`;
      const bar = el("span", {
        class: "chart-bar",
        style: `height:${(day.tasks / max) * 100}%`,
      });
      const column = el(
        "div",
        { class: "chart-column", tabindex: "0", "aria-label": text },
        el(
          "div",
          { class: "chart-plot" },
          i === peak && day.tasks ? el("span", { class: "chart-value", text: String(day.tasks) }) : null,
          bar,
        ),
        el("span", {
          class: "chart-day",
          text: dayLabel(day.key, { weekday: "short" }).slice(0, 2),
          "aria-hidden": "true",
        }),
      );
      const show = () => {
        tooltip.replaceChildren(
          el("strong", { text: `${day.tasks} ${day.tasks === 1 ? "Aufgabe" : "Aufgaben"}` }),
          el("span", { text: dayLabel(day.key, { weekday: "long", day: "numeric", month: "long" }) }),
          day.tasks ? el("span", { text: `${day.ok} beim 1. Versuch richtig` }) : null,
        );
        tooltip.hidden = false;
        tooltip.style.left = `${((i + 0.5) / days.length) * 100}%`;
        column.classList.add("active");
      };
      const hide = () => {
        tooltip.hidden = true;
        column.classList.remove("active");
      };
      column.addEventListener("pointerenter", show);
      column.addEventListener("pointerleave", hide);
      column.addEventListener("focus", show);
      column.addEventListener("blur", hide);
      return column;
    });
    const table = el(
      "details",
      { class: "chart-table" },
      el("summary", { text: "Als Tabelle anzeigen" }),
      el(
        "table",
        {},
        el("thead", {}, el("tr", {}, el("th", { text: "Tag" }), el("th", { text: "Aufgaben" }), el("th", { text: "Beim 1. Versuch" }), el("th", { text: "Minuten" }))),
        el(
          "tbody",
          {},
          days.map((day) =>
            el(
              "tr",
              {},
              el("td", { text: dayLabel(day.key, { weekday: "short", day: "numeric", month: "numeric" }) }),
              el("td", { text: String(day.tasks) }),
              el("td", { text: String(day.ok) }),
              el("td", { text: String(Math.round(day.ms / 60000)) }),
            ),
          ),
        ),
      ),
    );
    return el("div", { class: "activity-chart" }, el("div", { class: "chart-columns" }, columns, tooltip), table);
  }

  /* Level history as a 2px line with an end dot; one series, no legend. */
  function sparkline(history, maxLevel) {
    if (!history.length) return el("span", { class: "muted", text: "–" });
    const width = 96;
    const height = 28;
    const pad = 5;
    const points = history.map((level, i) => [
      history.length === 1 ? width - pad : pad + (i / (history.length - 1)) * (width - 2 * pad),
      height - pad - (level / Math.max(1, maxLevel)) * (height - 2 * pad),
    ]);
    const chart = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      class: "sparkline",
      role: "img",
      "aria-label": `Stufenverlauf: ${history.map((level) => level + 1).join(", ")}`,
    });
    const title = svg("title");
    title.textContent = `Stufe ${history[0] + 1} → ${history.at(-1) + 1}`;
    chart.append(title);
    chart.append(svg("line", { x1: pad, x2: width - pad, y1: height - pad, y2: height - pad, class: "sparkline-base" }));
    if (points.length > 1)
      chart.append(svg("polyline", { points: points.map((p) => p.join(",")).join(" "), class: "sparkline-line" }));
    const [x, y] = points.at(-1);
    chart.append(svg("circle", { cx: x, cy: y, r: 4, class: "sparkline-dot" }));
    return chart;
  }

  function meter(value, label) {
    return el(
      "span",
      { class: "meter", role: "img", "aria-label": label },
      el("span", { class: "meter-fill", style: `width:${Math.round(value * 100)}%` }),
    );
  }

  function letterChips(entries, empty) {
    if (!entries.length) return el("p", { class: "muted", text: empty });
    return el(
      "ul",
      { class: "letter-chips" },
      entries.map((entry) =>
        el(
          "li",
          { class: "letter-chip" },
          el("strong", { text: entry.letter }),
          el("span", { text: `${percent(entry.rate)} · ${entry.seen}×` }),
        ),
      ),
    );
  }

  const TRENDS = {
    up: ["▲", "sicherer"],
    down: ["▼", "mehr Fehler"],
    flat: ["→", "stabil"],
  };

  function render(root, report, now = Date.now()) {
    const k = report.kpis;
    const pointDelta =
      k.rate == null || k.rateBefore == null ? null : Math.round((k.rate - k.rateBefore) * 100);
    // Optional sections are null when empty; only real nodes are inserted.
    const sections = [
      el(
        "p",
        { class: "report-intro" },
        "So entwickelt sich euer Kind. Alle Angaben stammen nur aus diesem Browser auf diesem Gerät. „Beim 1. Versuch richtig“ zeigt, was schon sicher sitzt – Fehler gehören zum Lernen dazu.",
      ),
      report.enoughData
        ? null
        : el("p", { class: "report-notice", text: "Noch wenig Daten: Nach ein paar Runden wird die Auswertung aussagekräftiger." }),
      el(
        "div",
        { class: "stat-row" },
        tile("Aufgaben (7 Tage)", String(k.tasks), k.tasks - k.tasksBefore, k.tasks - k.tasksBefore === 1 ? "Aufgabe" : "Aufgaben"),
        tile("Beim 1. Versuch richtig", percent(k.rate), pointDelta, "Prozentpunkte"),
        tile("Gespielte Tage (14 Tage)", String(k.activeDays), null, ""),
        tile("Spielzeit (7 Tage)", `${k.minutes} min`, k.minutes - k.minutesBefore, "min"),
      ),
      el("section", { class: "report-card" }, el("h2", { text: "Aktivität der letzten 14 Tage" }), el("p", { class: "muted", text: "Gelöste Aufgaben pro Tag" }), activityChart(report.activity)),
      el(
        "div",
        { class: "report-columns" },
        el(
          "section",
          { class: "report-card" },
          el("h2", {}, el("span", { "aria-hidden": "true", text: "💪 " }), "Stärken"),
          report.strengths.length
            ? el("ul", { class: "report-list" }, report.strengths.map((text) => el("li", { text })))
            : el("p", { class: "muted", text: "Zeigt sich nach ein paar Runden." }),
        ),
        el(
          "section",
          { class: "report-card" },
          el("h2", {}, el("span", { "aria-hidden": "true", text: "🎯 " }), "Hier lohnt sich Üben"),
          report.focus.length
            ? el("ul", { class: "report-list" }, report.focus.map((text) => el("li", { text })))
            : el("p", { class: "muted", text: "Gerade nichts Auffälliges." }),
        ),
      ),
      report.tips.length
        ? el("section", { class: "report-card" }, el("h2", {}, el("span", { "aria-hidden": "true", text: "💡 " }), "Ideen für zu Hause"), el("ul", { class: "report-list" }, report.tips.map((text) => el("li", { text }))))
        : null,
      el(
        "section",
        { class: "report-card" },
        el("h2", { text: "Bereiche" }),
        el(
          "div",
          { class: "area-rows" },
          report.areas.map((area) =>
            el(
              "div",
              { class: "area-row" },
              el("strong", { text: area.title }),
              el("span", { class: "area-metric" }, el("span", { class: "muted", text: "Beim 1. Versuch richtig" }), meter(area.rate ?? 0, `${area.title}: ${percent(area.rate)} beim ersten Versuch richtig`), el("span", { text: percent(area.rate) })),
              el("span", { class: "area-metric" }, el("span", { class: "muted", text: "Stufen erreicht" }), meter(area.progress, `${area.title}: ${Math.round(area.progress * 100)} % der Stufen erreicht`), el("span", { text: `${Math.round(area.progress * 100)} %` })),
            ),
          ),
        ),
      ),
      el(
        "section",
        { class: "report-card" },
        el("h2", { text: "Spiele" }),
        el(
          "div",
          { class: "table-scroll" },
          el(
            "table",
            { class: "game-table" },
            el(
              "thead",
              {},
              el("tr", {}, ["Spiel", "Stufe", "Verlauf", "Beim 1. Versuch (zuletzt)", "Trend", "Aufgaben", "Zuletzt"].map((text) => el("th", { text, scope: "col" }))),
            ),
            el(
              "tbody",
              {},
              report.games.map((game) =>
                el(
                  "tr",
                  {},
                  el("th", { scope: "row" }, el("span", { "aria-hidden": "true", text: `${game.icon} ` }), game.title, game.together ? el("span", { class: "muted", text: " (zu zweit)" }) : null),
                  el(
                    "td",
                    { "data-label": "Stufe" },
                    el("span", { class: "level-cell" }, meter((game.level + 1) / (game.maxLevel + 1), `Stufe ${game.level + 1} von ${game.maxLevel + 1}`), el("span", { text: `${game.level + 1} / ${game.maxLevel + 1}` })),
                    el("span", { class: "muted level-label", text: game.levelLabel }),
                  ),
                  el("td", { "data-label": "Verlauf" }, sparkline(game.history, game.maxLevel)),
                  el("td", { class: "num", "data-label": "Beim 1. Versuch", text: percent(game.recentRate) }),
                  el("td", { class: "trend", "data-label": "Trend" }, game.trend ? [el("span", { "aria-hidden": "true", text: `${TRENDS[game.trend][0]} ` }), TRENDS[game.trend][1]] : el("span", { class: "muted", text: "–" })),
                  el("td", { class: "num", "data-label": "Aufgaben", text: String(game.tasks) }),
                  el("td", { "data-label": "Zuletzt", text: since(game.last, now) }),
                ),
              ),
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "report-columns" },
        el(
          "section",
          { class: "report-card" },
          el("h2", { text: "Laute" }),
          el("p", { class: "muted", text: "Aus „Hören & tippen“ und „Anlaut-Detektiv“: Anteil beim ersten Versuch richtig · wie oft geübt." }),
          el("h3", { text: "Sitzen sicher" }),
          letterChips(report.sounds.strong, "Noch keine – mindestens 3 Aufgaben pro Laut nötig."),
          el("h3", { text: "Noch üben" }),
          letterChips(report.sounds.weak, "Keine auffälligen Laute."),
          el("h3", { text: "Verwechslungen" }),
          report.sounds.confusions.length
            ? el("ul", { class: "report-list" }, report.sounds.confusions.map((pair) => el("li", { text: `${pair.a} ↔ ${pair.b}: ${pair.count}×` })))
            : el("p", { class: "muted", text: "Keine wiederholten Verwechslungen." }),
        ),
        el(
          "section",
          { class: "report-card" },
          el("h2", { text: "ABC" }),
          el("p", { class: "muted", text: "Aus „Wer fehlt?“, „ABC-Nachbarn“ und „ABC-Werkstatt“." }),
          el("h3", { text: "Sitzen sicher" }),
          letterChips(report.abc.strong, "Noch keine – mindestens 3 Aufgaben pro Buchstabe nötig."),
          el("h3", { text: "Noch üben" }),
          letterChips(report.abc.weak, "Keine auffälligen Buchstaben."),
          el("h3", { text: "Merkwörter (C, Qu, V, X, Y)" }),
          report.merk.length
            ? el(
                "ul",
                { class: "letter-chips" },
                report.merk.map((entry) =>
                  el(
                    "li",
                    { class: "letter-chip" },
                    el("strong", { text: entry.title }),
                    el("span", { text: `${percent(entry.rate)} · ${entry.seen}×` }),
                  ),
                ),
              )
            : el("p", { class: "muted", text: "Noch nicht gespielt." }),
        ),
      ),
    ];
    root.replaceChildren(...sections.filter(Boolean));
  }

  window.WieseReport = { render };
})();
