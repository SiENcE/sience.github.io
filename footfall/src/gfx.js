/* Pixel graphics: an integer-scaled low-res screen and the primitives drawn on it.
 *
 * Everything is drawn in logical pixels onto a small canvas that CSS scales up
 * by a whole number with `image-rendering: pixelated`.  Nothing is anti-aliased:
 * text comes from 1-bit glyphs in the atlas, lines and circles are plotted pixel
 * by pixel, and soft shading is faked with ordered (Bayer) dithering.
 */
"use strict";

const ATLAS = window.ATLAS;
// two canvases, one over the other: the island (the world view) and the menus (the ui
// view, transparent).  Each has its own whole-number scale, so the island can zoom
// while the menus keep their size (PROFILE.menuZoom off); with it on, both zoom together
const cvs = document.getElementById("screen");
const ucvs = document.getElementById("ui");
const VIEW = {
  world: { c: cvs, g: cvs.getContext("2d", { alpha: false }), w: 640, h: 360, px: 1, ox: 0, oy: 0 },
  ui: { c: ucvs, g: ucvs.getContext("2d"), w: 640, h: 360, px: 1, ox: 0, oy: 0 },
};
// every primitive draws to `ctx` in the view's logical pixels (VW x VH, PX device
// pixels each): the menus' view, except while the island is drawn (useView, inWorld),
// and briefly another canvas (withCtx)
let ctx = VIEW.ui.g, VW = 640, VH = 360, PX = 1, curView = VIEW.ui;
function useView(v) { curView = v; ctx = v.g; VW = v.w; VH = v.h; PX = v.px; }
function inWorld(fn) { const old = curView; useView(VIEW.world); try { fn(); } finally { useView(old); } }
function withCtx(g, fn) {
  const old = ctx;
  ctx = g;
  try { fn(); } finally { ctx = old; }
}
// a point on the island's view, in the menus' logical pixels
const worldToUi = (x, y) => [(VIEW.world.ox + x * VIEW.world.px - VIEW.ui.ox) / VIEW.ui.px, (VIEW.world.oy + y * VIEW.world.px - VIEW.ui.oy) / VIEW.ui.px];
// zoom steps the island's pixel scale up or down by whole numbers (and the menus', with menuZoom)
let zoom = PROFILE.zoom || 0;
const IMG = { atlas: null, title: null, chart: null };

function loadImage(src) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function fitScreen() {
  const dpr = window.devicePixelRatio || 1;
  const dw = Math.round(innerWidth * dpr), dh = Math.round(innerHeight * dpr);
  // the short side gets ~300 logical pixels: at 1080p that is 640x360 at x3.
  // Zoom adds whole steps, as long as at least ~170 logical pixels remain.
  const base = Math.max(1, Math.floor(Math.min(dw, dh) / 300)), most = Math.max(1, Math.floor(Math.min(dw, dh) / 170));
  zoom = Math.max(1 - base, Math.min(most - base, zoom));
  const fit = (v, px) => {
    v.px = px;
    v.w = Math.floor(dw / px); v.h = Math.floor(dh / px);
    v.c.width = v.w; v.c.height = v.h;
    // exact device-pixel size, so every logical pixel is PX x PX device pixels
    v.ox = Math.floor((dw - v.w * px) / 2); v.oy = Math.floor((dh - v.h * px) / 2);
    Object.assign(v.c.style, { width: (v.w * px) / dpr + "px", height: (v.h * px) / dpr + "px", left: v.ox / dpr + "px", top: v.oy / dpr + "px" });
    v.g.imageSmoothingEnabled = false;
  };
  fit(VIEW.world, base + zoom);
  fit(VIEW.ui, PROFILE.menuZoom === false ? base : base + zoom);
  useView(VIEW.ui);
}

// pointer position in the menus' logical pixels, and on the island's view
function toLogical(e, v = VIEW.ui) {
  const r = v.c.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * v.w), Math.floor(((e.clientY - r.top) / r.height) * v.h)];
}
const toWorld = e => toLogical(e, VIEW.world);

// ----------------------------------------------------------------- palette

const C = {
  ink: "#1c1424",      // outlines
  win: "#2c3350", winHi: "#4a5680", winLo: "#1b2036",
  slot: "#161a2c", slotHi: "#343d62", slotLo: "#0c0e18",
  btn: "#3b4670", btnHi: "#6272a8", btnLo: "#232a48", btnHover: "#4a5888",
  text: "#fbf1d9", dim: "#b4b8d0", faint: "#6a7090",
  gold: "#ffd66b", goldLo: "#b88a2c", green: "#a6e36b", red: "#ff8c7a", sky: "#8fd8ff",
  food: "#f2c75c", wood: "#e8a46c", coin: "#ffe27a", goods: "#e0c08c",
};

// ------------------------------------------------------------------ sprites

function sprite(name, x, y, flip = false) {
  const r = ATLAS.sprites[name];
  if (!r) return;
  x = Math.round(x); y = Math.round(y);
  if (flip) {
    ctx.save(); ctx.translate(x + r[2], y); ctx.scale(-1, 1);
    ctx.drawImage(IMG.atlas, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    ctx.restore();
  } else ctx.drawImage(IMG.atlas, r[0], r[1], r[2], r[3], x, y, r[2], r[3]);
}
const spriteSize = name => { const r = ATLAS.sprites[name]; return r ? [r[2], r[3]] : [0, 0]; };
function spriteC(name, cx, cy, flip) {
  const [w, h] = spriteSize(name);
  sprite(name, Math.round(cx - w / 2), Math.round(cy - h / 2), flip);
}
// bottom-centre anchored, the way things stand on a tile
function spriteB(name, cx, by, flip) {
  const [w, h] = spriteSize(name);
  sprite(name, Math.round(cx - w / 2), Math.round(by - h), flip);
}

// single-colour copies of a sprite (silhouettes for locked cards, flashes), cached
const silCache = new Map();
function silhouette(name, x, y, colour) {
  const key = name + colour;
  if (!silCache.has(key)) {
    const [w, h] = spriteSize(name), r = ATLAS.sprites[name];
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(IMG.atlas, r[0], r[1], w, h, 0, 0, w, h);
    g.globalCompositeOperation = "source-in"; g.fillStyle = colour; g.fillRect(0, 0, w, h);
    silCache.set(key, c);
  }
  ctx.drawImage(silCache.get(key), Math.round(x), Math.round(y));
}

// ------------------------------------------------------------------- text

const tintCache = new Map();
function tintedAtlas(colour) {
  if (!tintCache.has(colour)) {
    const c = document.createElement("canvas");
    c.width = IMG.atlas.width; c.height = IMG.atlas.height;
    const g = c.getContext("2d");
    g.drawImage(IMG.atlas, 0, 0);
    g.globalCompositeOperation = "source-in"; g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
    tintCache.set(colour, c);
  }
  return tintCache.get(colour);
}

function textWidth(str, font = "small") {
  const f = ATLAS.fonts[font];
  let w = 0;
  for (const ch of String(str)) w += (f.glyphs[ch] || f.glyphs["?"]).adv;
  return w;
}
const lineHeight = (font = "small") => ATLAS.fonts[font].line;

// every font is placed so its capitals start 1px below `y`; small and caps
// share a 5px cap height, so mixed lines line up on one baseline
const capTop = font => ATLAS.fonts[font].glyphs.H.oy;

function drawGlyphs(str, x, y, font, colour) {
  const f = ATLAS.fonts[font], src = tintedAtlas(colour);
  y += 1 - capTop(font);
  for (const ch of str) {
    const g = f.glyphs[ch] || f.glyphs["?"];
    if (g.r) ctx.drawImage(src, g.r[0], g.r[1], g.r[2], g.r[3], x + g.ox, y + g.oy, g.r[2], g.r[3]);
    x += g.adv;
  }
}

// y is the top of the line; a 1px drop shadow keeps text readable over the island.
// `outline` rings every glyph in ink as well: for text floating over the busy map
function text(str, x, y, { font = "small", colour = C.text, align = "left", shadow = C.ink, outline = false } = {}) {
  str = String(str);
  const w = textWidth(str, font);
  x = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
  y = Math.round(y);
  if (outline) for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [1, 2], [0, 2]]) drawGlyphs(str, x + dx, y + dy, font, C.ink);
  else if (shadow) drawGlyphs(str, x + 1, y + 1, font, shadow);
  drawGlyphs(str, x, y, font, colour);
  return w;
}

// a label that fits maxW: in caps if it can, else in the small font, else cut short
function fitLabel(str, maxW, font = "caps") {
  if (textWidth(str, font) <= maxW) return { s: str, font };
  if (font === "caps" && textWidth(str, "small") <= maxW) return { s: str, font: "small" };
  let t = str;
  while (t.length > 1 && textWidth(t + ".", "small") > maxW) t = t.slice(0, -1);
  return { s: t.trimEnd() + ".", font: "small" };
}

function wrap(str, maxW, font = "small") {
  const lines = [];
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? line + " " + word : word;
    if (textWidth(test.replace(/\*/g, ""), font) > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  // keep *accent* spans balanced across line breaks
  let open = false;
  return lines.map(l => {
    const s = (open ? "*" : "") + l;
    const n = (l.match(/\*/g) || []).length;
    if (n % 2) open = !open;
    return open ? s + "*" : s;
  });
}

// ------------------------------------------------------------ UI furniture

const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

// a bevelled box with notched corners: outline, face, light top-left, dark bottom-right
function bevel(x, y, w, h, face, hi, lo, ink = C.ink) {
  rect(x + 1, y, w - 2, h, ink); rect(x, y + 1, w, h - 2, ink);
  rect(x + 1, y + 1, w - 2, h - 2, face);
  rect(x + 1, y + 1, w - 2, 1, hi); rect(x + 1, y + 1, 1, h - 2, hi);
  rect(x + 1, y + h - 2, w - 2, 1, lo); rect(x + w - 2, y + 1, 1, h - 2, lo);
}
const windowBox = (x, y, w, h) => bevel(x, y, w, h, C.win, C.winHi, C.winLo);
const slotBox = (x, y, w, h) => bevel(x, y, w, h, C.slot, C.slotLo, C.slotHi);

function buttonBox(x, y, w, h, { hover = false, pressed = false, disabled = false, accent = null } = {}) {
  if (disabled) return bevel(x, y, w, h, C.winLo, C.win, C.winLo);
  if (pressed) return bevel(x, y, w, h, C.btnLo, C.slotLo, C.btn);
  bevel(x, y, w, h, hover ? C.btnHover : C.btn, C.btnHi, C.btnLo);
  if (accent) rect(x + 2, y + h - 3, w - 4, 1, accent);
}

// small hand-drawn icons for the utility buttons
const ICONS = {
  note: ["..##", "..#.#", "..#..", "..#..", "###..", "###.."],
  mute: ["..##...", "..#.#..", "..#....", "..#.#.#", "###..#.", "###.#.#"],
  help: [".##.", "#..#", "..#.", ".#..", "....", ".#.."],
  close: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  fast: ["#..#..", "##.##.", "######", "##.##.", "#..#.."],
  play: ["#...", "##..", "###.", "##..", "#..."],
  axe: [".###.", "####.", ".####", "..#.#", ".#...", "#...."],
  menu: ["#####", ".....", "#####", ".....", "#####"],
  person: [".#.", "###", ".#.", "#.#"],
  bed: ["#....", "#.###", "#####", "#...#"],
  arrow: ["..#..", ".###.", "#####", "..#..", "..#.."],
  check: [".....#", "....#.", "#..#..", ".##...", ".#...."],
  feet: [".#....", "###...", "###.#.", ".#.###", "...###", "....#."],
  left: ["...#", "..##", ".###", "..##", "...#"],
  right: ["#...", "##..", "###.", "##..", "#..."],
  dice: ["#######", "#.....#", "#.#...#", "#..#..#", "#...#.#", "#.....#", "#######"],
  down: ["..#..", "..#..", "#.#.#", ".###.", "..#..", "#####"],
  hand: [".#.#.", ".#.#.", "#####", "#####", ".###."],
  crate: ["#####", "#.#.#", "#####", "#.#.#", "#####"],
  mug: ["####.", "#..##", "#..#.", "#..##", "####."],
  shop: ["#####", "#.#.#", ".....", "#...#", "#...#"],
  moon: [".###", "##..", "#...", "##..", ".###"],
  compass: ["..#..", ".###.", "#.#.#", ".###.", "..#.."],
  boat: ["..#...", "..##..", "..###.", "######", ".####."],
  isle: ["..#..", ".###.", "#####"],
  lantern: [".#.", "###", "#.#", "###"],
  hat: ["..##..", ".####.", "######"],
  star: ["..#..", ".###.", "#####", ".#.#."],
  bars: ["....#", "..#.#", "..#.#", "#.#.#", "#.#.#", "#####"],
  letter: ["#######", "##...##", "#.#.#.#", "#..#..#", "#######"],
  chest: [".#####.", "#.....#", "#######", "#..#..#", "#######"],
  pearl: [".##.", "#..#", "#.##", ".##."],
};
function icon(name, x, y, colour) {
  ctx.fillStyle = colour;
  ICONS[name].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") ctx.fillRect(x + i, y + j, 1, 1); });
}

// ------------------------------------------------------------- dithering

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// 4x4 patterns with `level` of 16 cells set — for fades and shades
const ditherCache = new Map();
function ditherPattern(level, colour) {
  const key = level + colour;
  if (!ditherCache.has(key)) {
    const c = document.createElement("canvas"); c.width = c.height = 4;
    const g = c.getContext("2d"); g.fillStyle = colour;
    for (let i = 0; i < 16; i++) if (BAYER[i] < level) g.fillRect(i & 3, i >> 2, 1, 1);
    ditherCache.set(key, ctx.createPattern(c, "repeat"));
  }
  return ditherCache.get(key);
}

// ------------------------------------------------------------ plotting

function plot(x, y) { ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }

// quadratic curve plotted one pixel at a time
function curve(ax, ay, mx, my, bx, by, colour) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.2));
  ctx.fillStyle = colour;
  let lx = NaN, ly = NaN;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = Math.round(u * u * ax + 2 * u * t * mx + t * t * bx);
    const y = Math.round(u * u * ay + 2 * u * t * my + t * t * by);
    if (x === lx && y === ly) continue;
    lx = x; ly = y;
    ctx.fillRect(x, y, 1, 1);
  }
}

// dotted ellipse; `gap` skips every nth point.  flat=0.5 lies on the iso ground
function ring(cx, cy, r, colour, gap = 3, phase = 0, flat = 1) {
  ctx.fillStyle = colour;
  const n = Math.max(8, Math.round(r * 2 * Math.PI));
  for (let i = 0; i < n; i++) {
    if (gap && (i + phase) % gap === 0) continue;
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * flat), 1, 1);
  }
}

// ------------------------------------------------------------- iso tiles

// the 32x16 diamond: row r spans 16 +- hw(r); rows interlock with neighbours
// exactly, with no overlap and no gaps
const diamondHW = r => (r < 8 ? 2 * r + 1 : 31 - 2 * r);
const inDiamond = (px, py) => py >= 0 && py < TH && Math.abs(px + 0.5 - 16) < diamondHW(py);

// outline and fill of one tile, cached per colour
const tileCache = new Map();
function tileShape(colour, fill) {
  const key = colour + fill;
  if (!tileCache.has(key)) {
    const c = document.createElement("canvas"); c.width = TW; c.height = TH;
    const g = c.getContext("2d"); g.fillStyle = colour;
    for (let y = 0; y < TH; y++) {
      const hw = diamondHW(y), x0 = 16 - hw, x1 = 16 + hw - 1;
      if (fill === "solid") g.fillRect(x0, y, x1 - x0 + 1, 1);
      else if (fill === "edge") { g.fillRect(x0, y, 1, 1); g.fillRect(x1, y, 1, 1); if (y === 0 || y === TH - 1) g.fillRect(x0, y, x1 - x0 + 1, 1); }
      else if (fill.startsWith("side:")) {
        // solid 2:1 lines along the chosen screen sides, e.g. "side:NE,SW".
        // NE faces tile (x, y-1), SE (x+1, y), SW (x, y+1), NW (x-1, y)
        const top = y < 8;
        if (fill.includes(top ? "NW" : "SW")) g.fillRect(x0, y, 2, 1);
        if (fill.includes(top ? "NE" : "SE")) g.fillRect(x1 - 1, y, 2, 1);
      }
      else for (let x = x0; x <= x1; x++) if (bayer(x, y) < +fill) g.fillRect(x, y, 1, 1);
    }
    tileCache.set(key, c);
  }
  return tileCache.get(key);
}
// draw a tile shape with its top vertex at (sx, sy); fill: "solid", "edge", "side:..", or a dither level
function drawTile(sx, sy, colour, fill = "edge") {
  ctx.drawImage(tileShape(colour, fill), Math.round(sx) - 16, Math.round(sy));
}
