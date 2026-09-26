/* The codex: every mechanic on its own page, with a live pixel illustration,
 * a few lines to reread, and SHOW ME, which closes the book and replays that
 * lesson's cue in the reef.  A page is "new" (gold dot) once its lesson has
 * been learned and until it's been opened.  Open with the ? button or H.
 */
"use strict";

const PAGES = [
  { id: "basics", name: "Basics", icon: "i_heart", lesson: "tap", art: artBasics, text: [
    "Tap the *Heart of the Deep* to gather *lumen* - the light everything costs.",
    "The heart also beats on its own. Each beat sends a ring through the water, and every creature it passes flashes.",
  ] },
  { id: "creatures", name: "Creatures", icon: "i_jelly", lesson: "buy", art: artCreatures, text: [
    "Buy creatures in the panel. Each one glows *lumen every second* - even while you are away, for up to 8 hours.",
    "Every purchase raises that creature's price by 15%. The gold bar under a row shows how close you are. *x10* and *MAX* buy in bulk.",
  ] },
  { id: "threads", name: "Threads", icon: "i_seahorse", lesson: "thread", art: artThreads, text: [
    "When two *different* species drift close, a *thread* of light forms between them.",
    "Every thread raises *Resonance*, which multiplies all your light. The same kind never links, and each creature holds 3 threads at most - so mix your reef.",
  ] },
  { id: "current", name: "Current", icon: "i_angler", lesson: "current", art: artCurrent, text: [
    "Hold anywhere in the open water to pull a *current*. Nearby creatures swirl into a ring around it.",
    "Threads inside the current reach further and count *double* - they turn gold. The meter drains while you hold and refills when you let go.",
  ] },
  { id: "mutations", name: "Mutations", icon: "i_pearl", lesson: "mutation", art: artMutations, text: [
    "One-time upgrades that appear as your reef grows. Hover one to read it (on touch: tap once), click to buy it.",
    "Gold dots mark creature upgrades: one dot doubles that species, two dots triple it.",
  ] },
  { id: "spores", name: "Spores", icon: "i_spore", lesson: "spore", art: artSpores, text: [
    "Now and then a golden *spore* drifts across the water. Catch it before it leaves!",
    "It brings either a *Bloom Frenzy* - x7 light for 20 seconds - or a burst of lumen.",
  ] },
  { id: "vents", name: "Vents", icon: "i_shrimp", lesson: "vents", art: artVents, late: true, text: [
    "In the *Midnight Trench*, hot vents break through the floor. Threads inside a vent's plume are *charged*: they count double, like threads in a held current, but for free.",
    "Warm water draws creatures in. *Ember Shrimp* love it most. Mutations open more vents and widen the plumes.",
  ] },
  { id: "anchors", name: "Anchors", icon: "i_sponge", lesson: "anchor", art: artAnchors, late: true, text: [
    "Some creatures never swim. *Anchored* ones stay where they are and hold *2 extra threads*.",
    "*Drag* an anchor to a busy stretch of water, where swimmers pass close, and it will weave them all together.",
  ] },
  { id: "gulper", name: "Gulper", icon: "i_tripod", lesson: "gulper", art: artGulper, late: true, text: [
    "On the *Abyssal Plain* a *Gulper* eel slides through now and then, eating every thread its jaws cross. A bitten pair can't link again for a few seconds.",
    "*Tap it three times* to drive it off. It flees and leaves a *Bloom Frenzy* behind.",
  ] },
  { id: "gate", name: "Way Down", icon: "i_pearl", lesson: "gate", art: artGate, late: true, text: [
    "Deeper zones only open once you have *mastered* the one you are in. The Descend plate shows what the way down asks of you.",
    "Pearls still gather while you work on it.",
  ] },
  { id: "log", name: "Depth Log", icon: "bpearl", lesson: "log", art: artLog, late: true, text: [
    "*Black pearls* come from mastering zones, trials, secrets, the bestiary and shiny creatures. They are never lost.",
    "Spend them on the *Abyssal Tree*, wear *relics* you have found, and see which trials are open. Open the log with the black pearl button, or L.",
  ] },
  { id: "descend", name: "Descend", icon: "i_nautilus", lesson: "descend", art: artDescend, text: [
    "Once you have gathered *1M lumen* in total you can *Descend*: the reef is released and you sink into a deeper zone.",
    "You keep your *pearls*, and every pearl makes all light *+10%* brighter, forever. Each new pearl needs more light than the last.",
  ] },
];

const pageUnlocked = p => learned(p.lesson);
// the zone pages stay out of the book until their zone has been reached
const pagesShown = () => PAGES.filter(p => !p.late || pageUnlocked(p) || ui.codex.page === p.id);
const codexUnread = () => PAGES.some(p => pageUnlocked(p) && !S.read.includes(p.id));

function openCodex(id) {
  const first = PAGES.find(p => pageUnlocked(p) && !S.read.includes(p.id)) || PAGES[0];
  ui.codex = { page: id || first.id };
  ui.tapTip = null; current.on = false;
  chime(pent(7), 0.04, 1.2);
}
function closeCodex() { ui.codex = null; }

function drawCodex() {
  ui.hot = [];
  hotspot(0, 0, VW, VH, "cx:out", closeCodex); // clicking outside the book closes it
  ctx.fillStyle = ditherPattern(8, "#01040a");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(VW - 10, 344), h = Math.min(VH - 10, 246);
  const x = Math.round((VW - w) / 2), y = Math.round((VH - h) / 2);
  hotspot(x, y, w, h, "cx:win", null);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 13, C.winLo);
  text("HOW TO PLAY", x + 7, y + 4, { font: "caps", colour: C.gold });
  const bx = x + w - 17;
  let hv = hotspot(bx, y + 3, 14, 11, "cx:close", closeCodex);
  buttonBox(bx, y + 3, 14, 11, { hover: hv, pressed: pressed("cx:close", hv) });
  icon("close", bx + 5, y + 6, C.text);

  const page = PAGES.find(p => p.id === ui.codex.page);
  if (pageUnlocked(page) && !S.read.includes(page.id)) S.read.push(page.id);

  const narrow = w < 300;
  let cx, cy, cw;
  const shown = pagesShown();
  if (!narrow) {
    const th = Math.min(20, Math.floor((h - 52) / shown.length));
    shown.forEach((p, i) => codexTab(p, x + 4, y + 18 + i * th, 94, th - 1, true));
    hintsToggle(x + 4, y + h - 17, 94);
    realtimeToggle(x + 4, y + h - 31, 94);
    cx = x + 103; cy = y + 18; cw = w - 108;
  } else {
    const tw = Math.min(22, Math.floor((w - 8) / shown.length));
    shown.forEach((p, i) => codexTab(p, x + 4 + i * tw, y + 18, tw - 1, 20, false));
    hintsToggle(x + 5, y + h - 17, 80);
    realtimeToggle(x + 88, y + h - 17, 90);
    cx = x + 5; cy = y + 41; cw = w - 10;
  }

  text(page.name, cx + 1, cy + 1, { font: "big", colour: "#aef3ff" });
  const art = { x: cx, y: cy + 16, w: cw, h: 72 };
  slotBox(art.x, art.y, art.w, art.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(art.x + 2, art.y + 2, art.w - 4, art.h - 4); ctx.clip();
  page.art({ x: art.x + 2, y: art.y + 2, w: art.w - 4, h: art.h - 4 });
  ctx.restore();

  let ty = art.y + art.h + 6;
  for (const para of page.text) {
    for (const line of wrap(para, cw - 4)) { rich(line, cx + 2, ty, C.dim); ty += 9; }
    ty += 4;
  }

  const sw = 60, sx = cx + cw - sw, sy = y + h - 18;
  hv = hotspot(sx, sy, sw, 14, "cx:show", () => { closeCodex(); tutReplay(page.lesson); });
  buttonBox(sx, sy, sw, 14, { hover: hv, pressed: pressed("cx:show", hv), accent: C.gold });
  text("SHOW ME", sx + sw / 2, sy + 3 + (pressed("cx:show", hv) ? 1 : 0), { font: "caps", colour: C.gold, align: "center" });
}

function codexTab(p, x, y, w, h, wide) {
  const on = ui.codex.page === p.id, id = "cx:" + p.id;
  const hv = hotspot(x, y, w, h, id, () => (ui.codex.page = p.id), wide ? {} : { tip: [p.name.toUpperCase()] });
  buttonBox(x, y, w, h, { hover: hv, pressed: on || pressed(id, hv) });
  const d = on ? 1 : 0;
  spriteC(p.icon, x + (wide ? 10 : w / 2) + d, y + h / 2 + d);
  if (wide) text(p.name.toUpperCase(), x + 21 + d, y + Math.round(h / 2) - 4 + d, { font: "caps", colour: on ? C.cyan : C.dim });
  if (pageUnlocked(p) && !S.read.includes(p.id)) rect(x + w - 5, y + 3, 2, 2, C.gold);
}

function realtimeToggle(x, y, w) {
  const hv = hotspot(x, y, w, 13, "cx:realtime", () => { S.realtime = !S.realtime; save(); },
    { tip: ["REAL-TIME EVENTS", "When on, the night tide comes on your local clock, after midnight. When off, it comes every two hours of play."] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: pressed("cx:realtime", hv) });
  text("CLOCK", x + 5, y + 3, { font: "caps", colour: C.dim });
  text(S.realtime ? "ON" : "OFF", x + w - 5, y + 3, { font: "caps", colour: S.realtime ? C.cyan : C.faint, align: "right" });
}

function hintsToggle(x, y, w) {
  const hv = hotspot(x, y, w, 13, "cx:hints", () => { S.hints = !S.hints; save(); },
    { tip: ["HINTS", "The hand and brackets that point out what to do next."] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: pressed("cx:hints", hv) });
  text("HINTS", x + 5, y + 3, { font: "caps", colour: C.dim });
  text(S.hints ? "ON" : "OFF", x + w - 5, y + 3, { font: "caps", colour: S.hints ? C.cyan : C.faint, align: "right" });
}

// ------------------------------------------------------------ illustrations
// Each gets the inner box of the picture frame and animates on `now`.

// a mote travelling along an arc, t in 0..1
function artMote(x0, y0, x1, y1, t, colour = C.gold) {
  const u = 1 - t, mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 14;
  rect(Math.round(u * u * x0 + 2 * u * t * mx + t * t * x1), Math.round(u * u * y0 + 2 * u * t * my + t * t * y1), 2, 2, colour);
}
function artGlow(colour, x, y, r, alpha) {
  ctx.globalCompositeOperation = "lighter";
  glow(colour, x, y, r, alpha);
  ctx.globalCompositeOperation = "source-over";
}
function artCounter(x, y, value) {
  sprite("spore", x, y);
  text(fmt(value), x + 16, y + 1, { font: "big", colour: "#fff3cf" });
}

function artBasics(b) {
  const hx = b.x + 44, hy = b.y + b.h / 2, ph = (now * 1.2) % 1, press = ph < 0.2;
  artGlow("#55ccfb", hx, hy, 40, 0.3);
  ctx.globalCompositeOperation = "source-over";
  spriteC(press ? "heart_f" : "heart", hx, hy);
  if (press) ring(hx + 8, hy + 8, 3 + ph * 20, C.gold, 3);
  drawHand(hx + 8, hy + 8, press);
  if (ph < 0.7) text("+1", hx + 2, hy - 30 - ph * 14, { colour: C.gold });
  const kx = b.x + b.w - 60, ky = b.y + 20;
  artCounter(kx, ky, Math.floor(now * 1.2));
  for (let i = 0; i < 2; i++) artMote(hx, hy - 10, kx + 6, ky + 6, (ph + i * 0.15) % 1);
}

function artCreatures(b) {
  const kinds = ["plankton", "jelly", "seahorse", "nautilus"], gap = b.w / (kinds.length + 1.6);
  const kx = b.x + b.w - 48, ky = b.y + 6;
  sprite("spore", kx, ky);
  text("/s", kx + 16, ky + 3, { colour: C.gold });
  kinds.forEach((k, i) => {
    const x = b.x + gap * (i + 0.7), y = b.y + b.h - 22 + Math.round(Math.sin(now * 2 + i));
    const s = SP[k];
    artGlow(s.glow, x, y, 12, 0.3);
    ctx.globalCompositeOperation = "source-over";
    spriteC(s.frames ? s.frames[Math.sin(now * 2.2 + i) > 0.25 ? 1 : 0] : s.spr, x, y, false);
    artMote(x, y - 8, kx + 6, ky + 6, (now * 0.6 + i * 0.25) % 1, s.glow);
  });
}

function artThreads(b) {
  const y = b.y + b.h / 2 + 4, t = (now * 0.5) % 1;
  // two different species: a thread
  const ax = b.x + 26, bx = b.x + Math.min(96, b.w * 0.42);
  artGlow(SP.jelly.glow, ax, y, 12, 0.3); artGlow(SP.seahorse.glow, bx, y, 12, 0.3);
  curve(ax, y, (ax + bx) / 2, y - 12, bx, y, SP.jelly.glow, SP.seahorse.glow);
  const u = 1 - t;
  rect(Math.round(u * u * ax + 2 * u * t * (ax + bx) / 2 + t * t * bx), Math.round(u * u * y + 2 * u * t * (y - 12) + t * t * y), 2, 2, "#ffffff");
  ctx.globalCompositeOperation = "source-over";
  spriteC("jelly" + (Math.sin(now * 2.2) > 0.25 ? 1 : 0), ax, y);
  spriteC("seahorse", bx, y + Math.round(Math.sin(now * 2)));
  text("x1.04", (ax + bx) / 2, b.y + 4, { font: "caps", colour: C.violet, align: "center" });
  // the same species twice: nothing
  if (b.w > 170) {
    const cx = b.x + b.w - 56, dx = b.x + b.w - 20;
    spriteC("plankton", cx, y); spriteC("plankton", dx, y + Math.round(Math.sin(now * 2)));
    ctx.fillStyle = C.red;
    for (let i = cx + 8; i < dx - 7; i += 3) ctx.fillRect(i, y, 1, 1);
    const mx = Math.round((cx + dx) / 2);
    for (let i = -2; i <= 2; i++) { ctx.fillRect(mx + i, y - 8 + i, 1, 1); ctx.fillRect(mx + i, y - 8 - i, 1, 1); }
  }
}

function artCurrent(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (let i = 0; i < 3; i++) {
    const r = 9 + i * 9, a0 = now * (2.4 - i * 0.4) + i;
    arcDots(cx, cy, r, a0, a0 + 1.4, i % 2 ? C.gold : "#8feaff");
    arcDots(cx, cy, r, a0 + Math.PI, a0 + Math.PI + 1, i % 2 ? C.gold : "#8feaff");
  }
  const kinds = ["i_jelly", "i_seahorse", "i_plankton", "i_angler"], pts = kinds.map((k, i) => {
    const a = now * 0.9 + (i * Math.PI * 2) / kinds.length;
    return [cx + Math.cos(a) * 26, cy + Math.sin(a) * 20];
  });
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; curve(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, q[0], q[1], "#ffb347", C.gold); });
  pts.forEach((p, i) => spriteC(kinds[i], p[0], p[1]));
  drawHand(cx, cy, true, 0.9);
}

function artMutations(b) {
  const icons = ["i_heart", "i_pearl", "i_spore", "i_seahorse"], x0 = b.x + 10, y0 = b.y + 12;
  const hoverI = Math.floor(now / 1.5) % icons.length;
  icons.forEach((ic, i) => {
    const x = x0 + i * 22;
    buttonBox(x, y0, 18, 18, { hover: i === hoverI });
    spriteC(ic, x + 9, y0 + 9);
    if (i === 3) rect(x + 14, y0 + 14, 2, 2, C.gold);
  });
  const hx = x0 + hoverI * 22 + 11;
  drawHand(hx, y0 + 12);
  const tx = x0 + icons.length * 22 + 6;
  if (tx + 60 < b.x + b.w) {
    bevel(tx, y0 - 2, 62, 34, "#0b1628", C.winHi, C.ink);
    text(["TENDRILS", "THREADS", "SPORES", "HARMONY"][hoverI], tx + 5, y0 + 2, { font: "caps", colour: C.gold });
    text(hoverI === 2 ? "spores x2" : "light x2", tx + 5, y0 + 13, { colour: C.dim });
    text("once", tx + 5, y0 + 22, { colour: C.faint });
  }
}

function artSpores(b) {
  const t = (now * 0.25) % 1, x = b.x - 10 + t * (b.w + 20), y = b.y + b.h / 2 + Math.sin(now * 2) * 8;
  artGlow("#ffc760", x, y, 14, 0.5);
  ctx.globalCompositeOperation = "source-over";
  spriteC("spore", x, y);
  for (let i = 1; i < 6; i++) rect(Math.round(x - i * 5), Math.round(y + Math.sin(now * 2 - i * 0.3) * 3), 1, 1, C.goldLo);
  text("x7", b.x + b.w - 26, b.y + 6, { font: "big", colour: C.gold });
}

function artDescend(b) {
  const bands = ["#10445a", "#1a2d5c", "#2a2150", "#1a0d2a"], bh = b.h / bands.length;
  bands.forEach((c, i) => {
    rect(b.x, Math.round(b.y + i * bh), b.w, Math.ceil(bh), c);
    ctx.fillStyle = ditherPattern(6, bands[Math.min(i + 1, bands.length - 1)]);
    ctx.fillRect(b.x, Math.round(b.y + (i + 1) * bh) - 4, b.w, 4);
    text(ZONE_DEFS[i].name.toUpperCase(), b.x + b.w - 4, Math.round(b.y + i * bh) + 4, { colour: C.dim, align: "right", shadow: false });
  });
  const t = (now * 0.3) % 1, px = b.x + 30, py = b.y + 4 + t * (b.h - 12);
  artGlow("#c3a0ff", px, py + 6, 12, 0.5);
  ctx.globalCompositeOperation = "source-over";
  sprite("pearl", px - 6, py);
}

function artVents(b) {
  const vx = b.x + b.w / 2, fy = b.y + b.h - 4, py = fy - 26;
  rect(b.x, fy, b.w, 2, "#1b2740");
  artGlow("#ff7a3a", vx, fy - 3, 12, 0.6);
  for (let i = 0; i < 10; i++) {
    const t = (now * 0.5 + i / 10) % 1;
    rect(Math.round(vx + Math.sin(i * 7 + t * 6) * 4), Math.round(fy - 2 - t * 44), 1, 1, EMBER[Math.min(3, Math.floor(t * 4))]);
  }
  ctx.globalAlpha = 0.5; ring(vx, py, 22, "#ff9a52", 4, Math.floor(now * 3)); ctx.globalAlpha = 1;
  // a thread inside the plume burns orange; one outside stays cool
  const ax = vx - 14, bx = vx + 14, ay = py + Math.round(Math.sin(now * 2) * 2);
  curve(ax, ay, vx, ay - 6, bx, ay, "#ff7a3a", "#ffb347");
  const ox = b.x + 22, oy = b.y + 18;
  curve(ox, oy, ox + 18, oy - 6, ox + 36, oy, SP.jelly.glow, SP.seahorse.glow);
  ctx.globalCompositeOperation = "source-over";
  spriteC("shrimp", ax, ay); spriteC("jelly0", bx, ay);
  spriteC("jelly1", ox, oy); spriteC("seahorse", ox + 36, oy);
  text("x2", vx + 26, py - 20, { font: "caps", colour: C.gold });
}

function artAnchors(b) {
  const ph = (now % 3) / 3, k = Math.max(0, Math.min(1, (ph - 0.15) / 0.5));
  const sx = lerp(b.x + 24, b.x + b.w / 2, k), sy = lerp(b.y + b.h - 14, b.y + b.h / 2 + 4, k);
  // swimmers pass by; once the anchor sits among them, they all link to it
  const swim = [0, 1, 2].map(i => {
    const a = now * 0.8 + i * 2.1;
    return [b.x + b.w / 2 + Math.cos(a) * 34, b.y + b.h / 2 + Math.sin(a) * 16, ["jelly0", "seahorse", "shrimp"][i]];
  });
  if (k >= 1) for (const [x, y] of swim) curve(sx, sy, (sx + x) / 2, (sy + y) / 2 - 4, x, y, SP.sponge.glow, "#ffffff");
  artGlow(SP.sponge.glow, sx, sy, 12, 0.4);
  ctx.globalCompositeOperation = "source-over";
  for (const [x, y, spr] of swim) spriteC(spr, x, y);
  spriteC("sponge", sx, sy);
  if (ph < 0.7) drawHand(sx + 2, sy + 2, ph > 0.1, 0.9);
}

function artGulper(b) {
  const t = (now * 0.2) % 1, gx = b.x - 40 + t * (b.w + 80), gy = b.y + b.h / 2 + Math.sin(now) * 5;
  const cutX = b.x + b.w / 2;
  // a thread across its path, bitten through once the jaws pass
  if (gx + 22 < cutX) curve(cutX - 20, b.y + 10, cutX, b.y + b.h / 2, cutX + 20, b.y + b.h - 10, SP.jelly.glow, SP.angler.glow);
  else {
    ctx.fillStyle = C.red;
    for (let i = -2; i <= 2; i++) { ctx.fillRect(cutX + i, b.y + b.h / 2 - 12 + i, 1, 1); ctx.fillRect(cutX + i, b.y + b.h / 2 - 12 - i, 1, 1); }
  }
  ctx.globalCompositeOperation = "source-over";
  spriteC("gulper", gx, gy);
  const taps = Math.floor(((now * 0.2) % 1) * 6) % 4;
  for (let i = 0; i < 3; i++) rect(b.x + 6 + i * 5, b.y + 6, 3, 3, i < taps ? C.gold : C.winHi);
}

function artGate(b) {
  const w = Math.min(130, b.w - 20), x = b.x + (b.w - w) / 2, y = b.y + b.h / 2 - 12;
  const k = (now * 0.25) % 1.3, open = k >= 1;
  if (open) buttonBox(x, y, w, 24, { accent: C.violet });
  else bevel(x, y, w, 24, C.winLo, C.win, C.winLo);
  sprite("pearl", x + 5, y + 6);
  text("DESCEND", x + 22, y + 4, { font: "caps", colour: open ? C.violet : C.faint });
  if (!open) {
    rect(x + 22, y + 16, w - 26, 1, C.winHi);
    rect(x + 22, y + 16, Math.round((w - 26) * k), 1, C.gold);
  } else text("the way is open", x + 22, y + 13, { colour: C.text });
}

function artLog(b) {
  // a little tree: three branches of nodes, lighting up one by one
  const grown = Math.floor(now * 1.5) % 9;
  TREE.forEach((br, ci) => {
    const cx = b.x + b.w / 2 + (ci - 1) * 40;
    for (let i = 0; i < 4; i++) {
      const y = b.y + 8 + i * 15, on = i * 3 + ci < grown;
      if (i < 3) rect(cx, y + 12, 1, 3, on ? br.colour : C.winHi);
      (on ? bevel : slotBox)(cx - 6, y, 12, 12, "#2a2150", br.colour, C.winLo);
    }
  });
  spriteC("bpearl", b.x + 14, b.y + 12);
  text(String(9 - grown), b.x + 22, b.y + 8, { colour: C.violet });
}
