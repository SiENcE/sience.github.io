/* The chronicle: the island's story in numbers (key C, or the bars button).
 *
 * The sim keeps a row a day in S.hist (HIST_KEYS) and the notable things in S.log
 * (applyNight, checkMilestones, the moments); this screen only draws them: charts
 * over the days (villagers, stock, paths), a map of the wear, the story so far, and
 * the realm of settled islands.  Charts are plotted pixel by pixel like everything else.
 */
"use strict";

const STAT_TABS = [["village", "VILLAGE"], ["stock", "STOCK"], ["paths", "PATHS"], ["story", "STORY"], ["realm", "REALM"]];
const SERIES = {
  village: [["pop", "villagers", "#a6e36b"], ["beds", "beds", "#8fd8ff"], ["idle", "free hands", "#ffd66b"]],
  stock: [["food", "food", "#f2c75c"], ["wood", "wood", "#e8a46c"], ["coin", "coins", "#ffe27a"], ["goods", "goods", "#e0c08c"]],
  paths: [["trail", "trails", "#dcb97e"], ["path", "paths", "#b08553"], ["cob", "cobbles", "#c9c1b2"]],
};

function openStats(tab) {
  if (day.on && ui.sleep) ui.sleep = false;
  ui.stats = { tab: tab || (ui.stats && ui.stats.tab) || "village", page: 0, hide: {} };
  ui.tool = null; ui.flyout = null; ui.tapTip = null;
  sfx.page();
}
function closeStats() { ui.stats = null; }
const histCol = k => HIST_KEYS.indexOf(k);

function drawStats() {
  ui.hot = [];
  hotspot(0, 0, VW, VH, "st:out", closeStats);
  ctx.fillStyle = ditherPattern(8, "#0a0c18");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(VW - 8, 420), h = Math.min(VH - 8, 268), x = Math.round((VW - w) / 2), y = Math.round((VH - h) / 2);
  hotspot(x, y, w, h, "st:win", null);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 13, C.winLo);
  text(`CHRONICLE: ${(S.name || "THE ISLAND").toUpperCase()}`, x + 7, y + 4, { font: "caps", colour: C.gold });
  const bx = x + w - 17, hv = hotspot(bx, y + 2, 14, 13, "st:close", closeStats, { tip: ["CLOSE", "Back to the island. Key: Esc"] });
  buttonBox(bx, y + 2, 14, 13, { hover: hv, pressed: pressed("st:close", hv) });
  icon("close", bx + 5, y + 6, C.text);
  // the tabs, wrapping onto a second row on a phone
  let tx = x + 4, row = 0;
  for (const [id, name] of STAT_TABS) {
    const tw = textWidth(name, "caps") + 10, on = ui.stats.tab === id, hid = "st:tab:" + id;
    if (tx + tw > x + w - 4) { row++; tx = x + 4; }
    const ty = y + 18 + row * 15, th = hotspot(tx, ty, tw, 13, hid, () => { ui.stats.tab = id; ui.stats.page = 0; sfx.click(); });
    buttonBox(tx, ty, tw, 13, { hover: th, pressed: on || pressed(hid, th) });
    text(name, tx + 5, ty + 3 + (on ? 1 : 0), { font: "caps", colour: on ? C.gold : C.dim });
    tx += tw + 2;
  }
  const box = { x: x + 6, y: y + 36 + row * 15, w: w - 12, h: h - 42 - row * 15 };
  const tab = ui.stats.tab;
  if (SERIES[tab]) drawSeriesTab(tab, box);
  else if (tab === "story") drawStory(box);
  else drawRealm(box);
}

// ------------------------------------------------------------------ charts

function drawSeriesTab(tab, box) {
  const H = S.hist || [];
  const ser = SERIES[tab], chartH = tab === "paths" ? box.h - 22 : box.h - 22, mapW = tab === "paths" ? Math.min(box.w / 2 - 4, Math.max(60, chartH)) : 0;
  const cb = { x: box.x, y: box.y, w: box.w - (mapW ? mapW + 6 : 0), h: chartH };
  // the legend: click a series to hide or show it
  let lx = box.x;
  for (const [k, name, col] of ser) {
    const last = H.length ? H[H.length - 1][histCol(k)] : 0, s = `${name} ${last}`, lw = textWidth(s) + 12, id = "st:s:" + k, off = ui.stats.hide[k];
    hotspot(lx, box.y + box.h - 12, lw, 11, id, () => { ui.stats.hide[k] = !off; sfx.click(); }, { tip: [name.toUpperCase(), off ? "Hidden: click to show it again." : "Click to hide it."] });
    rect(lx, box.y + box.h - 9, 6, 5, off ? C.faint : col);
    text(s, lx + 9, box.y + box.h - 11, { colour: off ? C.faint : C.text });
    lx += lw + 4;
  }
  lineChart(cb, H, ser.filter(([k]) => !ui.stats.hide[k]));
  if (mapW) wearMap({ x: box.x + box.w - mapW, y: box.y, w: mapW, h: chartH });
}

// a chart of the rows in H (day in column 0), one line per series, from 0 up to the
// biggest value shown; plotted as joined columns of pixels
function lineChart(b, H, ser) {
  slotBox(b.x, b.y, b.w, b.h);
  const ix = b.x + 26, iy = b.y + 6, iw = b.w - 32, ih = b.h - 20;
  if (H.length < 2) { text("The chronicle begins with the first day played.", b.x + b.w / 2, b.y + b.h / 2 - 4, { colour: C.faint, align: "center" }); return; }
  let top = 1;
  for (const r of H) for (const [k] of ser) top = Math.max(top, r[histCol(k)]);
  top = niceTop(top);
  // grid: four dotted lines with their values
  for (let g = 0; g <= 4; g++) {
    const gy = Math.round(iy + ih - (ih * g) / 4);
    for (let px = ix; px < ix + iw; px += 3) rect(px, gy, 1, 1, g ? "#2a3150" : "#4a5680");
    text(shortNum((top * g) / 4), ix - 3, gy - 3, { colour: C.faint, align: "right", shadow: null });
  }
  const d0 = H[0][0], d1 = H[H.length - 1][0], span = Math.max(1, d1 - d0);
  text(`day ${d0}`, ix, iy + ih + 4, { colour: C.faint, shadow: null });
  text(`day ${d1}`, ix + iw, iy + ih + 4, { colour: C.faint, align: "right", shadow: null });
  // the winters, shaded
  for (const r of H) if (weatherOf(r[0]).snow && R.weather !== "calm") { const px = Math.round(ix + ((r[0] - d0) / span) * (iw - 1)); rect(px, iy, Math.max(1, Math.ceil(iw / span)), ih, "#222a44"); }
  for (const [k, , col] of ser) {
    const c = histCol(k);
    let lx = null, ly = null;
    for (const r of H) {
      const px = Math.round(ix + ((r[0] - d0) / span) * (iw - 1)), py = Math.round(iy + ih - 1 - (r[c] / top) * (ih - 1));
      if (lx === null) rect(px, py, 1, 1, col);
      else if (px === lx) rect(px, Math.min(py, ly), 1, Math.abs(py - ly) + 1, col);
      else {
        // join to the last point, a column of pixels at a time
        let prev = ly;
        for (let xx = lx + 1; xx <= px; xx++) {
          const yy = Math.round(ly + ((py - ly) * (xx - lx)) / (px - lx));
          rect(xx, Math.min(yy, prev), 1, Math.abs(yy - prev) + 1, col);
          prev = yy;
        }
      }
      lx = px; ly = py;
    }
  }
}
const niceTop = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; };
const shortNum = v => (v >= 10000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (v / 1000).toFixed(1).replace(".0", "") + "k" : String(Math.round(v)));

// the island's wear as a map: grass, trails, paths and cobbles, buildings in ink
function wearMap(b) {
  slotBox(b.x, b.y, b.w, b.h);
  const k = Math.max(1, Math.floor(Math.min((b.w - 6) / N, (b.h - 16) / N))), ox = Math.round(b.x + (b.w - N * k) / 2), oy = b.y + 4;
  for (let i = 0; i < N * N; i++) {
    const g = S.ground[i], lv = g === "." ? level(i) : -1;
    const c = g === "~" ? "#2a5a78" : g === "_" ? "#8a8468" : g === "=" ? "#3f8fb4" : g === "#" ? "#8e6238" : bAt(i % N, (i / N) | 0) ? "#1c1424"
      : S.feat[i] !== "." ? "#3a6e3a" : ["#6a9a48", "#c8a868", "#b08553", "#d8d0c0"][lv];
    rect(ox + (i % N) * k, oy + ((i / N) | 0) * k, k, k, c);
  }
  text("the paths today", b.x + b.w / 2, b.y + b.h - 11, { colour: C.faint, align: "center", shadow: null });
}

// ------------------------------------------------------------------ the story

const LOG_COL = { milestone: C.gold, festival: C.gold, event: C.sky, secret: C.gold, weather: C.dim, built: C.green, letter: C.coin, arrive: C.green, voyage: C.gold };
function drawStory(box) {
  slotBox(box.x, box.y, box.w, box.h);
  const log = (S.log || []).slice().reverse(), per = Math.max(1, Math.floor((box.h - 20) / 9)), pages = Math.max(1, Math.ceil(log.length / per));
  ui.stats.page = Math.min(ui.stats.page, pages - 1);
  if (!log.length) text("Nothing has happened here yet.", box.x + box.w / 2, box.y + box.h / 2 - 4, { colour: C.faint, align: "center" });
  log.slice(ui.stats.page * per, ui.stats.page * per + per).forEach(([d, kind, s], i) => {
    const ly = box.y + 5 + i * 9;
    text(`day ${d}`, box.x + 6, ly, { colour: C.faint });
    const f = fitLabel(s, box.w - 56, "small");
    rich(f.s, box.x + 46, ly, LOG_COL[kind] || C.text);
  });
  if (pages > 1) {
    smallButton("st:prev", box.x + box.w - 90, box.y + box.h - 16, 40, "left", () => { ui.stats.page = Math.max(0, ui.stats.page - 1); });
    text(`${ui.stats.page + 1}/${pages}`, box.x + box.w - 108, box.y + box.h - 13, { colour: C.dim, align: "center" });
    smallButton("st:next", box.x + box.w - 46, box.y + box.h - 16, 40, "right", () => { ui.stats.page = Math.min(pages - 1, ui.stats.page + 1); });
  }
}

// ------------------------------------------------------------------ the realm

function drawRealm(box) {
  slotBox(box.x, box.y, box.w, box.h);
  const rows = W ? [...W.islands.map(i => ({ name: i.name, ch: i.chapter, traits: i.traits, days: i.days, pop: i.peak, trade: i.trade ? i.trade.level : 0, here: false })),
    { name: S.name || "this island", ch: S.chapter, traits: S.traits, days: S.day, pop: pop(), trade: null, here: true }] : [];
  const cols = [["ISLAND", 6], ["CH", 118], ["TRAITS", 136], ["DAYS", 200], ["PEAK", 232], ["TRADE", 266]];
  const narrow = box.w < 320;
  for (const [n, cx] of cols) if (!narrow || cx < 200) text(n, box.x + (narrow && cx > 118 ? cx - 10 : cx), box.y + 5, { font: "caps", colour: C.dim });
  rows.forEach((r, i) => {
    const ry = box.y + 17 + i * 12, col = r.here ? C.gold : C.text;
    if (ry > box.y + box.h - 34) return;
    text(fitLabel(r.name, 108, "small").s, box.x + 6, ry, { colour: col });
    text(String(r.ch), box.x + 118, ry, { colour: col });
    r.traits.forEach((t, k) => traitIcon(t, box.x + (narrow ? 126 : 136) + k * 11, ry - 1));
    if (narrow) return;
    text(String(r.days), box.x + 200, ry, { colour: col });
    text(String(r.pop), box.x + 232, ry, { colour: col });
    text(r.trade === null ? "-" : r.trade ? "level " + r.trade : "none", box.x + 266, ry, { colour: r.trade ? C.coin : C.faint });
  });
  const v = W ? W.voyage : null, secrets = new Set([...(v ? v.secrets || [] : []), ...(S.secrets || [])]).size;
  const charters = v ? Object.values(v.charters).flat().length + chartersMet().length : 0;
  const lines = [`Realm *${realmPop()}* villagers on *${rows.length}* island${rows.length === 1 ? "" : "s"}; *${charters}* charter${charters === 1 ? "" : "s"} met; *${secrets}* secret${secrets === 1 ? "" : "s"} found.`];
  if (v) lines.push(`Boons: ${v.boons.map(id => (BOONS.find(b => b.id === id) || {}).name).filter(Boolean).join(", ") || "none"}. Heirlooms: ${v.heirlooms.map(id => (HEIRLOOMS.find(h => h.id === id) || {}).name).filter(Boolean).join(", ") || "none"}.`);
  lines.flatMap(l => wrap(l, box.w - 12)).forEach((l, i, a) => rich(l, box.x + 6, box.y + box.h - 6 - (a.length - i) * 9, C.dim));
}
