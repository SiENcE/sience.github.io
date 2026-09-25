/* Pixel graphics: an integer-scaled low-res screen and the primitives drawn on it.
 *
 * Everything is drawn in logical pixels onto a small canvas that CSS scales up
 * by a whole number with `image-rendering: pixelated`.  Nothing is anti-aliased:
 * text comes from 1-bit glyphs in the atlas, lines and circles are plotted pixel
 * by pixel, and soft light is faked with ordered (Bayer) dithering.
 */
"use strict";

const ATLAS = window.ATLAS;
const cvs = document.getElementById("screen");
const ctx = cvs.getContext("2d", { alpha: false });
let VW = 480, VH = 270, PX = 1; // logical size, device pixels per logical pixel
const IMG = { atlas: null, bg: null };

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
  // the short side gets ~270 logical pixels (a bit more on portrait phones,
  // where the reef and the menu share the height)
  PX = Math.max(1, Math.floor(Math.min(dw, dh) / (dw >= dh ? 270 : 290)));
  VW = Math.floor(dw / PX); VH = Math.floor(dh / PX);
  cvs.width = VW; cvs.height = VH;
  // exact device-pixel size, so every logical pixel is PX x PX device pixels
  cvs.style.width = (VW * PX) / dpr + "px";
  cvs.style.height = (VH * PX) / dpr + "px";
  cvs.style.left = Math.floor((dw - VW * PX) / 2) / dpr + "px";
  cvs.style.top = Math.floor((dh - VH * PX) / 2) / dpr + "px";
  ctx.imageSmoothingEnabled = false;
}

// pointer position in logical pixels
function toLogical(e) {
  const r = cvs.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * VW), Math.floor(((e.clientY - r.top) / r.height) * VH)];
}

// ----------------------------------------------------------------- palette

const C = {
  ink: "#04070f",      // outlines
  win: "#13263f", winHi: "#26496d", winLo: "#0a1628",
  slot: "#081322", slotHi: "#1c3857", slotLo: "#02060d",
  btn: "#1d3a5c", btnHi: "#3d6f9b", btnLo: "#0f2139", btnHover: "#28507a",
  text: "#e9f4ff", dim: "#86a6c2", faint: "#4d6a86",
  cyan: "#6ff3ff", gold: "#ffd35c", goldLo: "#b8801f", violet: "#c3a0ff", red: "#ff7a86",
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

// silhouettes for locked shop entries, cached per sprite
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
  for (const ch of str) w += (f.glyphs[ch] || f.glyphs["?"]).adv;
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

// y is the top of the line; a 1px drop shadow keeps text readable over the reef
function text(str, x, y, { font = "small", colour = C.text, align = "left", shadow = C.ink } = {}) {
  str = String(str);
  const w = textWidth(str, font);
  x = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
  y = Math.round(y);
  if (shadow) drawGlyphs(str, x + 1, y + 1, font, shadow);
  drawGlyphs(str, x, y, font, colour);
  return w;
}

function wrap(str, maxW, font = "small") {
  const lines = [];
  let line = "";
  for (const word of str.split(" ")) {
    const test = line ? line + " " + word : word;
    if (textWidth(test, font) > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
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
  if (accent) { rect(x + 2, y + h - 3, w - 4, 1, accent); }
}

// small hand-drawn icons for the utility buttons
const ICONS = {
  note: ["..##", "..#.#", "..#..", "..#..", "###..", "###.."],
  mute: ["..##...", "..#.#..", "..#....", "..#.#.#", "###..#.", "###.#.#"],
  reset: [".###.", "#...#", "#....", "#..#.", ".####", "...#."],
  help: [".##.", "#..#", "..#.", ".#..", "....", ".#.."],
  close: ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
};
function icon(name, x, y, colour) {
  ctx.fillStyle = colour;
  ICONS[name].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") ctx.fillRect(x + i, y + j, 1, 1); });
}

// ------------------------------------------------------------- dithering

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// round halo made of ordered-dither dots: two tones, dense in the middle
const glowCache = new Map();
function glowSprite(colour, r) {
  r = Math.max(2, Math.round(r));
  const key = colour + r;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = r * 2 + 1;
  const g = c.getContext("2d");
  for (let y = 0; y <= r * 2; y++) {
    for (let x = 0; x <= r * 2; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d >= 1) continue;
      const t = Math.pow(1 - d, 1.4) * 16;
      if (t > BAYER[(y & 3) * 4 + (x & 3)] + 0.5) {
        g.fillStyle = t > 9 ? "#ffffff" : colour;
        g.globalAlpha = t > 9 ? 0.5 : 1;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  glowCache.set(key, c);
  return c;
}
function glow(colour, cx, cy, r, alpha) {
  const s = glowSprite(colour, r);
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, Math.round(cx) - (s.width >> 1), Math.round(cy) - (s.height >> 1));
  ctx.globalAlpha = 1;
}

// 4x4 patterns with `level` of 16 cells set — for fades and light shafts
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

// quadratic curve plotted one pixel at a time; colour switches half way
function curve(ax, ay, mx, my, bx, by, ca, cb) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.2));
  let lx = NaN, ly = NaN;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = Math.round(u * u * ax + 2 * u * t * mx + t * t * bx);
    const y = Math.round(u * u * ay + 2 * u * t * my + t * t * by);
    if (x === lx && y === ly) continue;
    lx = x; ly = y;
    ctx.fillStyle = t < 0.5 ? ca : cb;
    ctx.fillRect(x, y, 1, 1);
  }
}

// dotted circle (midpoint-style sampling), `gap` skips every nth point
function ring(cx, cy, r, colour, gap = 3, phase = 0) {
  ctx.fillStyle = colour;
  const n = Math.max(8, Math.round(r * 2 * Math.PI));
  for (let i = 0; i < n; i++) {
    if ((i + phase) % gap === 0) continue;
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}
