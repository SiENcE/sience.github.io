/* The menus before play: the title, NEW WORLD (the settings for a new world, with
 * a live map of its first island) and WORLDS (save slots, export and import).
 * Immediate mode like every other menu; ui.menu says which one is up while
 * ui.title is set.
 */
"use strict";

function openTitle() {
  if (!day.on) save();
  stopTyping();
  Object.assign(ui, { title: true, menu: "title", tool: null });
}

// the painted title card, whole-number scaled, behind every menu
function drawTitleArt() {
  if (!IMG.title) return;
  const s = Math.max(1, Math.floor(Math.min(VW / IMG.title.width, VH / IMG.title.height) + 0.25));
  const w = IMG.title.width * s, h = IMG.title.height * s;
  ctx.drawImage(IMG.title, Math.round((VW - w) / 2), Math.round((VH - h) / 2), w, h);
}

function drawMenus() {
  drawTitleArt();
  if (ui.menu === "setup") drawSetup();
  else if (ui.menu === "worlds") drawWorlds();
  else drawTitle();
  drawToast();
}

// one short line at the top of the menus ("IMPORTED ...")
const toast = { text: "", colour: C.green, until: 0 };
function menuToast(str, colour = C.green) { Object.assign(toast, { text: str, colour, until: now + 2.5 }); }
function drawToast() {
  if (now > toast.until) return;
  const w = textWidth(toast.text, "caps") + 12, x = Math.round((VW - w) / 2);
  bevel(x, 4, w, 13, "#10142a", C.winHi, C.ink);
  text(toast.text, VW / 2, 7, { font: "caps", colour: toast.colour, align: "center" });
}

// a big menu button with an optional second line
function menuButton(id, x, y, w, h, label, sub, fn, main) {
  const hv = hotspot(x, y, w, h, id, fn), d = pressed(id, hv) ? 1 : 0;
  buttonBox(x, y, w, h, { hover: hv, pressed: pressed(id, hv), accent: main ? C.gold : null });
  text(label, x + w / 2, y + (sub ? 5 : Math.round(h / 2) - 4) + d, { font: "caps", colour: main ? C.gold : C.text, align: "center" });
  if (sub) text(sub, x + w / 2, y + 15 + d, { colour: C.dim, align: "center" });
}
// a small one-line button
function smallButton(id, x, y, w, label, fn, { tip = null, accent = null, disabled = false } = {}) {
  const hv = hotspot(x, y, w, 13, id, disabled ? null : fn, tip ? { tip } : {}), d = pressed(id, hv) && !disabled ? 1 : 0;
  buttonBox(x, y, w, 13, { hover: hv, pressed: !disabled && pressed(id, hv), accent, disabled });
  if (ICONS[label]) icon(label, x + Math.round(w / 2 - ICONS[label][0].length / 2), y + Math.round(6.5 - ICONS[label].length / 2) + d, disabled ? C.faint : C.text);
  else { const f = fitLabel(label, w - 6); text(f.s, x + w / 2, y + 3 + d, { font: f.font, colour: disabled ? C.faint : accent || C.text, align: "center" }); }
}

// ------------------------------------------------------------------ title

function titleButtons() {
  const kept = !!slotOf(W.id);
  return [
    kept ? ["t0", "CONTINUE", `day ${S.day}, ${pop()} villagers`, startPlaying] : ["t0", "PLAY", "a new island", startPlaying],
    ["t1", "NEW WORLD", "choose your island", openSetup],
    SLOTS.worlds.length ? ["t2", "WORLDS", `${SLOTS.worlds.length} saved`, openWorlds] : null,
  ].filter(Boolean);
}
const titleDefault = () => titleButtons()[0][3]();

function drawTitle() {
  const w = 230, x = Math.round((VW - w) / 2), y = Math.round(VH * 0.07);
  windowBox(x, y, w, 46);
  rect(x + 2, y + 2, w - 4, 25, C.winLo);
  text("FOOTFALL", VW / 2, y + 5, { font: "big", colour: C.gold, align: "center" });
  text("a village that wears its own roads", VW / 2, y + 32, { colour: C.dim, align: "center" });

  const btns = titleButtons(), bw = 130, by0 = Math.min(Math.round(VH * 0.66), VH - btns.length * 30 - 14);
  btns.forEach(([id, label, sub, fn], i) => menuButton(id, Math.round((VW - bw) / 2), by0 + i * 30, bw, 26, label, sub, fn, i === 0));
  text("art: qwen-image  fonts: tiny5, silkscreen, jersey 10 (OFL)", VW / 2, VH - 11, { colour: "#e8f4f0", align: "center" });
}

function startPlaying() {
  ui.title = false;
  if (!S.seen) { S.seen = true; save(); }
  sfx.click();
}

// -------------------------------------------------------------- NEW WORLD

const setup = { s: null, nameK: 0, map: null, mapKey: "" };

function openSetup() {
  setup.s = { ...defaultSettings(), seed: newSeed() };
  setup.nameK = setup.s.seed;
  ui.menu = "setup";
  sfx.click();
}
function rerollSetup() { setup.s.seed = newSeed(); setup.nameK = setup.s.seed; sfx.click(); }

function beginWorld() {
  stopTyping();
  save(); // the world being left stays in its slot
  startWorld(setup.s, worldName(setup.nameK));
  S.seen = true;
  save();
  enterIsland();
  Object.assign(ui, { title: false, menu: "title" });
  sfx.milestone();
}

function drawSetup() {
  const rows = SETTINGS.length + 2, rowH = 14;
  const pw = Math.min(VW - 8, 236), ph = 18 + rows * rowH + 26;
  // the map goes beside the panel when there is room, else below it
  const side = VW >= pw + 170;
  const mw = side ? Math.min(300, VW - pw - 16) : pw, mh = side ? ph : Math.min(VH - ph - 16, Math.round(pw * 0.62));
  const totalW = side ? pw + 4 + mw : pw, totalH = side ? ph : ph + 4 + mh;
  const x = Math.round((VW - totalW) / 2), y = Math.max(4, Math.round((VH - totalH) / 2));

  windowBox(x, y, pw, ph);
  rect(x + 2, y + 2, pw - 4, 13, C.winLo);
  text("NEW WORLD", x + 7, y + 4, { font: "caps", colour: C.gold });
  const code = worldCode(setup.s);
  const chv = hotspot(x + 70, y + 2, pw - 74, 13, "set:code", () => copyText(code),
    { tip: ["WORLD CODE", "The same code makes the same island anywhere. Click to copy; paste one into the seed to use it."] });
  text(code, x + pw - 6, y + 5, { colour: chv ? C.text : C.faint, align: "right" });

  let ry = y + 18;
  for (const o of SETTINGS) { settingRow(o, x, ry, pw); ry += rowH; }
  seedRow(x, ry, pw); ry += rowH;
  nameRow(x, ry, pw); ry += rowH;

  const by = y + ph - 19, bw = Math.floor((pw - 16) / 3);
  smallButton("set:back", x + 4, by, bw, "BACK", () => { stopTyping(); ui.menu = "title"; });
  smallButton("set:reroll", x + 8 + bw, by, bw, "REROLL", rerollSetup, { tip: ["REROLL", "Another island, another name."] });
  smallButton("set:go", x + pw - 4 - bw, by, bw, "START", beginWorld, { accent: C.gold });

  const mx = side ? x + pw + 4 : x, my = side ? y : y + ph + 4;
  if (mh >= 40) drawSetupMap(mx, my, mw, mh);
}

// LABEL   < value >   : a tap on the value cycles forward, the arrows step
function settingRow(o, x, y, w) {
  const i = Math.max(0, o.values.indexOf(setup.s[o.key])), vx = x + 72, vw = w - 78, id = "set:" + o.key;
  text(o.label, x + 7, y + 3, { font: "caps", colour: o.later ? C.faint : C.dim });
  if (o.later) {
    hotspot(x + 4, y, w - 8, 12, id, null, { tip: [o.label, o.tip, "Comes with the voyages."] });
    bevel(vx, y, vw, 12, C.winLo, C.win, C.winLo);
    text(o.names[i], vx + vw / 2, y + 3, { colour: C.faint, align: "center" });
    return;
  }
  const step = d => { setup.s[o.key] = o.values[(i + d + o.values.length) % o.values.length]; sfx.click(); };
  arrowButton(id + ":prev", vx, y, "left", () => step(-1));
  arrowButton(id + ":next", vx + vw - 11, y, "play", () => step(1));
  const hv = hotspot(vx + 12, y, vw - 24, 12, id, () => step(1), { tip: [o.label, o.tip] });
  slotBox(vx + 12, y, vw - 24, 12);
  text(o.names[i], vx + vw / 2, y + 3, { colour: hv ? C.gold : C.text, align: "center" });
}
function arrowButton(id, x, y, ic, fn) {
  const hv = hotspot(x, y, 11, 12, id, fn), d = pressed(id, hv) ? 1 : 0;
  buttonBox(x, y, 11, 12, { hover: hv, pressed: pressed(id, hv) });
  icon(ic, x + 4, y + 4 + d, C.dim);
}

function seedRow(x, y, w) {
  const vx = x + 72, vw = w - 78, on = typing();
  text("SEED", x + 7, y + 3, { font: "caps", colour: C.dim });
  const hv = hotspot(vx, y, vw - 14, 12, "set:seed", startTyping, { tip: ["SEED", "The number the island grows from. Type one, or paste a world code."] });
  slotBox(vx, y, vw - 14, 12);
  const s = String(setup.s.seed), tw = text(s, vx + 4, y + 3, { font: "caps", colour: on ? C.gold : hv ? C.text : C.dim });
  if (on && Math.floor(now * 2.5) % 2) rect(vx + 5 + tw, y + 2, 1, 8, C.gold);
  smallButton("set:seed:dice", vx + vw - 12, y, 12, "dice", () => { setup.s.seed = newSeed(); sfx.click(); },
    { tip: ["NEW SEED", "Another island, same name."] });
}
function nameRow(x, y, w) {
  const vx = x + 72, vw = w - 78;
  text("NAME", x + 7, y + 3, { font: "caps", colour: C.dim });
  slotBox(vx, y, vw - 14, 12);
  text(worldName(setup.nameK), vx + 4, y + 3, { colour: C.text });
  smallButton("set:name:dice", vx + vw - 12, y, 12, "dice", () => { setup.nameK = newSeed(); sfx.click(); },
    { tip: ["NEW NAME", "The world's name, shown on its save and its chart."] });
}

// the first island as the settings would make it, redrawn when they change
function drawSetupMap(x, y, w, h) {
  const s = setup.s, key = [s.seed, s.size, s.rivers, s.forest].join(":");
  if (setup.mapKey !== key) { setup.mapKey = key; setup.map = previewIsland(s); }
  const m = setup.map;
  bevel(x, y, w, h, SEA, C.winHi, C.winLo);
  const k = Math.max(1, Math.min(6, Math.floor(Math.min((w - 8) / (2 * m.n), (h - 20) / m.n))));
  const c = thumbCanvas(m.codes, m.n, k);
  ctx.drawImage(c, Math.round(x + (w - c.width) / 2), Math.round(y + (h - 12 - c.height) / 2));
  const land = [...m.codes].filter(ch => ch !== "~").length;
  text(`${m.n} x ${m.n}, ${land} land tiles`, x + w / 2, y + h - 11, { colour: "#e8f4f0", align: "center" });
}

// genIsland for the preview, without touching the island being played
function previewIsland(s) {
  const n0 = N;
  N = s.size;
  try {
    const m = genIsland(s.seed, s); // s may carry traits (the chart's islands on offer)
    const isl = { n: N, ground: m.ground, feat: m.feat, soil: m.soil, height: m.height,
      b: [{ t: "hearth", x: m.hx, y: m.hy }, { t: "cottage", x: m.hx - 2, y: m.hy + 1 }] };
    return { n: N, codes: thumbCodes(isl) };
  } finally { N = n0; }
}

// ------------------------------------------------------------ thumbnails

const THUMB_COL = { ".": "#8cc063", m: "#a8c864", "=": "#5ab0cf", "#": "#c49460", t: "#4f8a3c", r: "#9a958a",
  w: "#cfa66a", c: "#c9c1b2", f: "#e8c24e", b: "#e08a3a", h: "#ffd66b", x: "#6f8a4a", z: "#a8a48c", e: "#8a9a4a", u: "#d8d0bc",
  _: "#d8c890", a: "#e6d49a", i: "#eef3f7", "^": "#a2bc72" };
const THUMB_DK = { t: "#3c7232", ".": "#80b45a", m: "#9cbc58" };
const CLIFF = [164, 116, 74];
const thumbCache = new Map();

// an island as a little iso picture: every tile a diamond 2k x k pixels, a cliff
// edge under the land.  k may be fractional (small slot thumbnails)
function thumbCanvas(codes, n, k) {
  const key = codes + k;
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (thumbCache.size > 40) thumbCache.clear();
  const W2 = Math.ceil(2 * n * k), cliff = Math.max(1, Math.round(k / 2)), H2 = Math.ceil(n * k) + cliff;
  const c = document.createElement("canvas"); c.width = W2; c.height = H2;
  const g = c.getContext("2d"), img = g.createImageData(W2, H2), d = img.data;
  const tileAt = (X, Y) => {
    const dx = X + 0.5 - n * k, dy = Y + 0.5, a = Math.floor(dy / k + dx / (2 * k)), b = Math.floor(dy / k - dx / (2 * k));
    return a >= 0 && b >= 0 && a < n && b < n ? codes[b * n + a] : "~";
  };
  for (let Y = 0; Y < H2; Y++) for (let X = 0; X < W2; X++) {
    let ch = tileAt(X, Y), col = THUMB_COL[ch];
    if (col && THUMB_DK[ch] && bayer(X, Y) < 5) col = THUMB_DK[ch];
    let rgb = col ? hex(col) : null;
    if (!rgb) for (let j = 1; j <= cliff; j++) if (tileAt(X, Y - j) !== "~") { rgb = CLIFF; break; }
    if (!rgb) continue;
    const o = (Y * W2 + X) * 4;
    d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  thumbCache.set(key, c);
  return c;
}

// ----------------------------------------------------------------- WORLDS

const worldsUI = { page: 0 };
function openWorlds() { save(); worldsUI.page = 0; ui.menu = "worlds"; sfx.click(); }

const agoText = t => {
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? "played today" : d === 1 ? "played yesterday" : `played ${d} days ago`;
};

function drawWorlds() {
  const list = slotsByPlayed(), rowH = 34, w = Math.min(VW - 8, 320);
  const per = Math.max(1, Math.min(6, Math.floor((VH - 8 - 42) / rowH))), pages = Math.max(1, Math.ceil(list.length / per));
  worldsUI.page = Math.min(worldsUI.page, pages - 1);
  const shown = list.slice(worldsUI.page * per, worldsUI.page * per + per);
  const h = 18 + Math.max(1, shown.length) * rowH + 22;
  const x = Math.round((VW - w) / 2), y = Math.max(4, Math.round((VH - h) / 2));
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 13, C.winLo);
  text("WORLDS", x + 7, y + 4, { font: "caps", colour: C.gold });
  if (pages > 1) {
    text(`${worldsUI.page + 1}/${pages}`, x + w - 36, y + 4, { colour: C.dim, align: "right" });
    arrowButton("w:prev", x + w - 30, y + 2, "left", () => (worldsUI.page = (worldsUI.page + pages - 1) % pages));
    arrowButton("w:next", x + w - 17, y + 2, "play", () => (worldsUI.page = (worldsUI.page + 1) % pages));
  }
  if (!shown.length) text("No worlds yet.", x + w / 2, y + 30, { colour: C.dim, align: "center" });
  shown.forEach((s, i) => worldRow(s, x + 4, y + 18 + i * rowH, w - 8, rowH - 2));

  const by = y + h - 18, bw = Math.floor((w - 16) / 3);
  smallButton("w:import", x + 4, by, bw, "IMPORT", importWorlds, { tip: ["IMPORT", "Add worlds from a file: an exported world or a backup. Nothing is overwritten."] });
  smallButton("w:backup", x + 8 + bw, by, bw, "BACKUP", exportBackup, { tip: ["BACKUP", "Every world and what you've learned, in one file."] });
  smallButton("w:back", x + w - 4 - bw, by, bw, "BACK", () => (ui.menu = "title"));
}

function worldRow(s, x, y, w, h) {
  const current = s.id === W.id;
  bevel(x, y, w, h, current ? "#343d62" : C.slot, C.slotLo, C.slotHi);
  const k = Math.min(1, 44 / (2 * s.n)), c = thumbCanvas(s.thumb, s.n, k);
  rect(x + 2, y + 2, 48, h - 4, SEA);
  ctx.drawImage(c, Math.round(x + 26 - c.width / 2), Math.round(y + h / 2 - c.height / 2));
  text(s.name.toUpperCase(), x + 55, y + 3, { font: "caps", colour: current ? C.gold : C.text });
  text(`chapter ${s.chapter}, day ${s.day}, ${s.pop} villagers`, x + 55, y + 12, { colour: C.dim });
  text(current ? "playing now" : agoText(s.played), x + 55, y + 20, { colour: C.faint });
  const bx = x + w - 3, by = y + Math.round(h / 2 - 6);
  smallButton("w:del:" + s.id, bx - 13, by, 13, "close", () => askDelete(s), { tip: ["DELETE", "Gone for good, unless it was exported."] });
  smallButton("w:exp:" + s.id, bx - 28, by, 14, "down", () => { exportWorld(s.id); menuToast("EXPORTED"); sfx.click(); }, { tip: ["EXPORT", "Save this world as a file."] });
  smallButton("w:play:" + s.id, bx - 60, by, 31, "PLAY", () => playSlot(s.id), { accent: C.gold });
}

function playSlot(id) {
  if (id === W.id) return startPlaying();
  save();
  const w = loadWorld(id);
  if (!w) return modal("Can't open", ["This world's save is damaged."]);
  openWorld(w);
  enterIsland();
  S.seen = true;
  save();
  Object.assign(ui, { title: false, menu: "title" });
  sfx.click();
}

async function askDelete(s) {
  if (!(await modal("Delete world?", [`*${s.name}* and everything on it will be gone for good, unless you exported it.`], "Delete", "Keep"))) return;
  deleteWorld(s.id);
  if (s.id === W.id) { startWorld({}); enterIsland(); } // a fresh island waits behind the title
  sfx.chop();
}

function importWorlds() {
  pickFile(text => {
    const r = importText(text);
    if (r.error) return modal("Can't import", [`This file can't be read: *${r.error}*.`]);
    worldsUI.page = 0;
    menuToast(r.names.length > 1 ? `IMPORTED ${r.names.length} WORLDS` : "IMPORTED " + r.names[0].toUpperCase());
    sfx.build();
  });
}

// ------------------------------------------------ the seed field and copying

// a hidden <input> takes the typing, so phones get a keyboard; the digits are
// drawn on the canvas.  A pasted world code sets every option at once
const seedInput = document.createElement("input");
Object.assign(seedInput, { type: "text", autocomplete: "off", spellcheck: false, maxLength: 40 });
seedInput.setAttribute("inputmode", "numeric");
Object.assign(seedInput.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0", border: "0", padding: "0" });
document.body.appendChild(seedInput);
seedInput.addEventListener("input", () => {
  const code = parseWorldCode(seedInput.value);
  if (code) { Object.assign(setup.s, code); setup.nameK = code.seed; seedInput.value = String(code.seed); return; }
  const digits = seedInput.value.replace(/\D/g, "").slice(0, 9);
  seedInput.value = digits;
  setup.s.seed = +digits || 0;
});

const typing = () => document.activeElement === seedInput;
function startTyping() { seedInput.value = String(setup.s.seed); seedInput.focus(); seedInput.select(); }
function stopTyping() { if (typing()) seedInput.blur(); }

function copyText(s) {
  const fallback = () => { seedInput.value = s; seedInput.select(); document.execCommand("copy"); seedInput.blur(); };
  (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).catch(fallback);
  menuToast("CODE COPIED");
}
