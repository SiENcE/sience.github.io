/* Pixel menus, drawn into the same low-res canvas as the reef.
 *
 * Immediate mode: every frame the HUD, panel, tooltip and dialog are drawn and
 * register their clickable rectangles ("hotspots"); input is matched against
 * the rectangles of the frame the player is looking at.
 */
"use strict";

const ui = {
  hot: [], press: null, drag: null, scroll: 0, maxScroll: 0, buyMode: 1,
  mouse: { x: -1, y: -1, in: false, touch: false }, tapTip: null, modal: null, hintGone: false,
  bump: 0, lastLinks: 0, counterBump: 0, resBump: 0, codex: null,
};
const inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

// register a clickable rect (optionally limited to a clip rect); returns hover state
function hotspot(x, y, w, h, id, onClick, extra = {}) {
  let r = { x, y, w, h };
  if (extra.clip) {
    const c = extra.clip, x0 = Math.max(x, c.x), y0 = Math.max(y, c.y);
    r = { x: x0, y: y0, w: Math.min(x + w, c.x + c.w) - x0, h: Math.min(y + h, c.y + c.h) - y0 };
    if (r.w <= 0 || r.h <= 0) return false;
  }
  ui.hot.push({ ...r, id, onClick, ...extra });
  return ui.mouse.in && !ui.mouse.touch && inRect(ui.mouse.x, ui.mouse.y, r);
}
const hitHot = (x, y) => { for (let i = ui.hot.length - 1; i >= 0; i--) if (inRect(x, y, ui.hot[i])) return ui.hot[i]; return null; };
const pressed = (id, hover) => ui.press === id && (hover || ui.mouse.touch);

// text with *starred* words in gold
function rich(line, x, y, colour = C.text) {
  let gold = false;
  for (const part of line.split("*")) {
    x += text(part, x, y, { colour: gold ? C.gold : colour });
    gold = !gold;
  }
}
const plain = s => s.replace(/\*/g, "");

// ------------------------------------------------------------------- HUD

function drawHUD() {
  const cx = play.cx;
  // while sinking the depth counts up with the camera
  const sinking = descent.active && descent.from;
  const zone = (sinking && !descent.done ? descent.from : Z).name.toUpperCase();
  const m = sinking ? Math.round(lerp(descent.from.depthM, descent.to.depthM, descent.p) / 10) * 10 : Z.depthM;
  text(`${zone}   ${m.toLocaleString()} M`, cx, 9, { font: "caps", colour: C.dim, align: "center" });

  // lumen motes fly into the counter; it hops a pixel when they land
  const n = fmt(S.lumen), w = textWidth(n, "big") + 17, hop = ui.counterBump > 0 ? 1 : 0;
  sprite("spore", Math.round(cx - w / 2), 16 - hop);
  text(n, cx - w / 2 + 17, 17 - hop, { font: "big", colour: hop ? "#ffffff" : "#fff3cf" });
  hudAnchor.counter = [cx, 22];

  const r = fmt(rate()), rw = textWidth(r + " lumen/s");
  text(r, cx - rw / 2, 32, { colour: C.text });
  text(" lumen/s", cx - rw / 2 + textWidth(r), 32, { colour: C.dim });
  hudAnchor.rate = [Math.round(cx - rw / 2), 40, rw];

  // resonance plate
  const parts = [["RESONANCE ", "caps", C.violet], ["x" + resonance.toFixed(2), "small", C.text],
    [`  ${linkCount} thread${linkCount === 1 ? "" : "s"}`, "small", C.dim]];
  if (charged) parts.push([`  ${charged} charged`, "small", C.gold]);
  const pw = parts.reduce((a, [s, f]) => a + textWidth(s, f), 0) + 10;
  const px = Math.round(cx - pw / 2), py = 41;
  hudAnchor.res = [cx, py + 6];
  const rv = revealed("res");
  if (rv > 0) drawResonance(parts, px, py, pw, rv);

  if (now < frenzyUntil) {
    const s = `BLOOM FRENZY x7  ${Math.ceil(frenzyUntil - now)}s`, fw = textWidth(s, "caps") + 10;
    const blink = Math.floor(now * 4) % 2;
    bevel(Math.round(cx - fw / 2), 57, fw, 12, blink ? "#5a3a10" : "#6b4612", "#b8801f", "#2c1a05");
    text(s, cx, 60, { font: "caps", colour: C.gold, align: "center" });
  }

  // current meter, bottom left of the water — slides in once the current matters
  const cv = revealed("current");
  const my = play.h - 14 + Math.round((1 - cv) * 20);
  text("CURRENT", 8, my, { font: "caps", colour: C.dim });
  const bx = 8 + textWidth("CURRENT ", "caps");
  slotBox(bx, my - 1, 48, 9);
  const fill = Math.round((44 * current.energy) / 100);
  for (let i = 0; i < fill; i++) rect(bx + 2 + i, my + 1, 1, 5, i < 22 ? "#4fd8ff" : "#b58cff");
  rect(bx + 2, my + 1, fill, 1, "#c9fbff");
  hudAnchor.meter = [bx + 24, my + 3];
  if (cv > 0.5) hotspot(8, my - 2, bx + 48 - 8, 11, "cur", null, {
    tip: ["CURRENT", "Hold anywhere in the water to pull a vortex. It drains while held and refills when released."] });

}

// the resonance plate unfolds from the middle the first time a thread forms
function drawResonance(parts, px, py, pw, rv) {
  const vw = Math.max(4, Math.round(pw * rv)), vx = Math.round(px + (pw - vw) / 2);
  ctx.save(); ctx.beginPath(); ctx.rect(vx, py, vw, 13); ctx.clip();
  const hov = hotspot(px, py, pw, 13, "res", null, {
    tip: ["RESONANCE", "Different species drifting close weave threads of light. Every thread boosts all production.",
      "Hold the water to pull a current: threads inside it reach further and count double."] });
  slotBox(px, py, pw, 13);
  if (ui.bump > 0 || ui.resBump > 0) rect(px + 1, py + 1, pw - 2, 11, ui.resBump > 0 ? "#4a3a80" : "#2a2150");
  let tx = px + 5;
  for (const [s, f, col] of parts) tx += text(s, tx, py + 3, { font: f, colour: hov && col === C.dim ? C.text : col });
  ctx.restore();
}

// ------------------------------------------------------------------ panel

function drawPanel() {
  const P = panel, pad = 5;
  windowBox(P.x, P.y, P.w, P.h);
  let y = P.y + 3;

  // title plate
  text("Abyssal Bloom", P.x + pad + 1, y + 1, { font: "big", colour: "#aef3ff" });
  y += 17;
  for (let x = P.x + 3; x < P.x + P.w - 3; x += 2) rect(x, y, 1, 1, C.winHi);
  y += 4;

  // mutations: the cheapest ones currently unlocked
  const perRow = Math.floor((P.w - pad * 2 + 2) / 20);
  const rows = P.portrait ? 1 : 2;
  const avail = UPGRADES.filter(upgradeHere).sort((a, b) => a.cost - b.cost)
    .slice(0, perRow * rows);
  if (avail.length) {
    text("MUTATIONS", P.x + pad + 1, y, { font: "caps", colour: C.dim });
    y += 10;
    avail.forEach((u, i) => {
      const x = P.x + pad + (i % perRow) * 20, yy = y + Math.floor(i / perRow) * 20;
      drawMutation(u, x, yy);
    });
    y += Math.ceil(avail.length / perRow) * 20 + 3;
  }

  // creatures header with the buy-amount toggle
  text("CREATURES", P.x + pad + 1, y + 1, { font: "caps", colour: C.dim });
  let bx = P.x + P.w - pad;
  for (const m of ["max", 10, 1]) {
    const label = m === "max" ? "MAX" : "x" + m, w = textWidth(label, "caps") + 7;
    bx -= w + 1;
    const on = ui.buyMode === m, hov = hotspot(bx, y - 1, w, 11, "mode" + m, () => (ui.buyMode = m));
    buttonBox(bx, y - 1, w, 11, { hover: hov, pressed: on || pressed("mode" + m, hov) });
    text(label, bx + 4, y + 1 + (on ? 1 : 0), { font: "caps", colour: on ? C.cyan : C.dim });
  }
  y += 13;

  // footer
  const showDescend = revealed("descend") > 0.5;
  const footH = showDescend ? 40 : 14, footY = P.y + P.h - footH;
  const list = { x: P.x + 2, y, w: P.w - 4, h: footY - y - 2 };
  drawShopList(list);
  drawFooter(P.x + pad, footY, P.w - pad * 2, showDescend);
}

function drawMutation(u, x, y) {
  const afford = S.lumen >= u.cost, id = "u:" + u.id;
  const hov = hotspot(x, y, 18, 18, id, () => {
    // on touch the first tap explains, the second buys
    if (ui.mouse.touch && ui.tapTip !== id) { ui.tapTip = id; return; }
    buyUpgrade(u);
  }, { tip: [u.name.toUpperCase(), u.desc, `*${fmt(u.cost)}* lumen`] });
  if (afford) buttonBox(x, y, 18, 18, { hover: hov, pressed: pressed(id, hov) });
  else slotBox(x, y, 18, 18);
  if (afford) spriteC(u.icon, x + 9, y + 9);
  else { const [iw, ih] = spriteSize(u.icon); silhouette(u.icon, x + 9 - iw / 2, y + 9 - ih / 2, "#2a4566"); }
  for (let i = 0; i < (u.tier || 0); i++) rect(x + 14 - i * 3, y + 14, 2, 2, C.gold);
  if (ui.tapTip === id) { rect(x, y, 18, 1, C.cyan); rect(x, y + 17, 18, 1, C.cyan); }
}

function drawShopList(L) {
  ctx.save();
  ctx.beginPath(); ctx.rect(L.x, L.y, L.w, L.h); ctx.clip();
  const rowH = 25;
  let prevOwned = true, y = L.y - Math.round(ui.scroll), shown = 0;
  const list = shopSpecies();
  for (const s of list) {
    const owned = S.owned[s.id] || 0;
    // the next species shows as a silhouette once the previous one is owned
    const known = s === list[0] || owned > 0 || S.total >= s.cost * 0.4;
    const visible = known || prevOwned;
    prevOwned = owned > 0;
    if (!visible) continue;
    drawShopRow(s, owned, known, L.x + 1, y, L.w - 2, rowH - 1, L);
    y += rowH; shown++;
  }
  ctx.restore();
  ui.maxScroll = Math.max(0, shown * rowH - L.h);
  ui.scroll = Math.max(0, Math.min(ui.maxScroll, ui.scroll));
  if (ui.maxScroll > 0) { // scroll thumb
    const th = Math.max(10, (L.h * L.h) / (L.h + ui.maxScroll));
    const ty = L.y + ((L.h - th) * ui.scroll) / ui.maxScroll;
    rect(L.x + L.w - 2, L.y, 1, L.h, C.winLo);
    rect(L.x + L.w - 2, Math.round(ty), 1, Math.round(th), C.btnHi);
  }
}

function drawShopRow(s, owned, known, x, y, w, h, clip) {
  const n = ui.buyMode === "max" ? Math.max(1, maxAffordable(s)) : ui.buyMode;
  const cost = bulkCost(s, n), afford = known && cost <= S.lumen, id = "s:" + s.id;
  const hov = hotspot(x, y, w, h, id, () => buy(s), {
    clip, scroll: true, tip: known ? [s.name.toUpperCase(), s.desc, `*${fmt(s.rate * M.sp[s.id] * pearlMult())}*/s each`] : null });
  if (afford) buttonBox(x, y, w, h, { hover: hov, pressed: pressed(id, hov) });
  else bevel(x, y, w, h, C.winLo, C.win, C.winLo);
  const dy = pressed(id, hov) && afford ? 1 : 0;

  slotBox(x + 3, y + 3, 18, 18);
  if (known) spriteC("i_" + s.id, x + 12, y + 12 + dy);
  else { const [iw, ih] = spriteSize("i_" + s.id); silhouette("i_" + s.id, x + 12 - iw / 2, y + 12 - ih / 2, "#1d3450"); }

  text(known ? s.name : "???", x + 25, y + 4 + dy, { colour: known ? C.text : C.faint });
  text(known ? `+${fmt(s.rate * M.sp[s.id] * pearlMult())}/s` : "something stirs...", x + 25, y + 13 + dy,
    { colour: known ? C.dim : C.faint });
  text(String(owned), x + w - 5, y + 4 + dy, { font: "caps", colour: known ? s.glow : C.faint, align: "right" });
  // saving up: a thin gold bar fills along the bottom of the row
  if (known && !afford) {
    const k = Math.max(0, Math.min(1, S.lumen / cost));
    rect(x + 2, y + h - 3, Math.round((w - 4) * k), 1, C.goldLo);
  }
  const price = (n > 1 ? `x${n} ` : "") + fmt(cost);
  text(price, x + w - 5, y + 13 + dy, { colour: afford ? C.gold : known ? "#8a6f5a" : C.faint, align: "right" });
}

function drawFooter(x, y, w, showDescend) {
  if (!showDescend) return drawFooterRow(x, y + 3, w);
  const pa = pearlsAvailable(), gate = gateMet(), can = pa >= 1 && gate;
  // a zone's gate comes first: until it is met, the plate shows its progress
  const hov = gate ? hotspot(x, y, w, 24, "descend", () => { if (can) askDescend(); })
    : hotspot(x, y, w, 24, "gate", null, { tip: ["THE WAY DOWN", Z.gate.desc] });
  if (can) buttonBox(x, y, w, 24, { hover: hov, pressed: pressed("descend", hov), accent: C.violet });
  else bevel(x, y, w, 24, C.winLo, C.win, C.winLo);
  sprite("pearl", x + 5, y + 6);
  text("DESCEND", x + 22, y + 4, { font: "caps", colour: can ? C.violet : C.faint });
  if (!gate) {
    const k = Math.min(1, (S.gate || 0) / Z.gate.need);
    text(Z.gate.text(S.gate || 0), x + 22, y + 13, { colour: C.gold });
    rect(x + 22, y + 21, w - 26, 1, C.winHi);
    rect(x + 22, y + 21, Math.round((w - 26) * k), 1, C.gold);
    return drawFooterRow(x, y + 27, w);
  }
  const info = can ? `to ${zoneDef(S.depth + 1).name}  +${pa} pearl${pa > 1 ? "s" : ""}`
    : S.allTime < DESCEND_AT ? `at ${fmt(DESCEND_AT)} lumen  (${Math.floor((100 * S.allTime) / DESCEND_AT)}%)`
      : `next pearl at ${fmt(Math.pow(S.pearls + 1, 2) * DESCEND_AT)}`;
  text(info, x + 22, y + 13, { colour: can ? C.text : C.faint });

  drawFooterRow(x, y + 27, w);
}

// pearls, and the help / sound / wipe buttons
function drawFooterRow(x, ry, w) {
  if (S.pearls || S.depth) {
    sprite("pearl", x, ry - 1);
    text(`${fmt(S.pearls)}  +${fmt(Math.round(S.pearls * M.pearlPct * 100))}%`, x + 15, ry + 1, { colour: C.dim });
  }
  const b2 = x + w - 13, b1 = b2 - 15, b0 = b1 - 15, bl = b0 - 15;
  let hv;
  if (logShown()) {
    hv = hotspot(bl, ry - 1, 13, 11, "log", () => openLog(), { tip: ["DEPTH LOG", `The tree, trials, secrets, relics and bestiary. *${S.black}* black pearls. Key: L`] });
    buttonBox(bl, ry - 1, 13, 11, { hover: hv, pressed: pressed("log", hv) });
    spriteC("bpearl", bl + 7, ry + 4);
    if (logNews() && Math.floor(now * 2) % 2) rect(bl + 10, ry, 2, 2, C.gold);
  }
  hv = hotspot(b0, ry - 1, 13, 11, "help", () => openCodex(), { tip: ["HOW TO PLAY", "Every mechanic, with a replay of its lesson. Key: H"] });
  buttonBox(b0, ry - 1, 13, 11, { hover: hv, pressed: pressed("help", hv) });
  icon("help", b0 + 5, ry + 1, C.cyan);
  // a gold dot while the codex holds a page you haven't read
  if (codexUnread() && Math.floor(now * 2) % 2) rect(b0 + 10, ry, 2, 2, C.gold);
  hv = hotspot(b1, ry - 1, 13, 11, "mute", toggleMute, { tip: ["SOUND", S.muted ? "Sound is off." : "Sound is on."] });
  buttonBox(b1, ry - 1, 13, 11, { hover: hv, pressed: pressed("mute", hv) });
  icon(S.muted ? "mute" : "note", b1 + 3, ry + 1, S.muted ? C.faint : C.cyan);
  hv = hotspot(b2, ry - 1, 13, 11, "reset", askReset, { tip: ["WIPE SAVE", "Start the reef over from nothing."] });
  buttonBox(b2, ry - 1, 13, 11, { hover: hv, pressed: pressed("reset", hv) });
  icon("reset", b2 + 4, ry + 1, C.dim);
}

// ---------------------------------------------------------------- tooltip

function drawTooltip() {
  let h = null;
  if (ui.tapTip) h = ui.hot.find(r => r.id === ui.tapTip);
  else if (ui.mouse.in && !ui.mouse.touch) h = hitHot(ui.mouse.x, ui.mouse.y);
  if (!h || !h.tip) return;
  const [title, ...body] = h.tip, maxW = 116;
  const lines = body.flatMap(b => wrap(b, maxW));
  const w = Math.max(textWidth(title, "caps"), ...lines.map(l => textWidth(plain(l)))) + 12;
  const bh = 16 + lines.length * 9;
  const ax = ui.tapTip ? h.x + h.w / 2 : ui.mouse.x, ay = ui.tapTip ? h.y + h.h : ui.mouse.y;
  let x = Math.round(ax + 8), y = Math.round(ay + 10);
  if (x + w > VW - 2) x = Math.round(ax - w - 6);
  if (y + bh > VH - 2) y = Math.round(ay - bh - 4);
  x = Math.max(2, x); y = Math.max(2, y);
  bevel(x, y, w, bh, "#0b1628", C.winHi, C.ink);
  text(title, x + 6, y + 4, { font: "caps", colour: C.gold });
  lines.forEach((l, i) => rich(l, x + 6, y + 14 + i * 9, C.dim));
  if (ui.tapTip) text("tap again to buy", x + w - 6, y + bh - 1, { colour: C.cyan, align: "right", shadow: false });
}

// ----------------------------------------------------------------- dialog

function modal(title, body, ok = "OK", cancel = null) {
  return new Promise(res => (ui.modal = { title, body, ok, cancel, res }));
}

function drawModal() {
  const m = ui.modal;
  ui.hot = []; // the dialog is the only thing that takes input
  ctx.fillStyle = ditherPattern(8, "#01040a");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(210, VW - 16), lines = m.body.flatMap(b => wrap(b, w - 20));
  const h = 32 + lines.length * 10 + 22, x = Math.round((VW - w) / 2), y = Math.round((VH - h) / 2);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 17, C.winLo);
  text(m.title, x + w / 2, y + 3, { font: "big", colour: C.violet, align: "center" });
  lines.forEach((l, i) => rich(l, x + 10, y + 26 + i * 10));
  const btns = m.cancel ? [[m.cancel, false], [m.ok, true]] : [[m.ok, true]];
  const bw = 60, gap = 8, total = btns.length * bw + (btns.length - 1) * gap;
  btns.forEach(([label, val], i) => {
    const bx = Math.round(x + (w - total) / 2 + i * (bw + gap)), by = y + h - 19, id = "m" + i;
    const hov = hotspot(bx, by, bw, 14, id, () => { ui.modal = null; m.res(val); });
    buttonBox(bx, by, bw, 14, { hover: hov, pressed: pressed(id, hov), accent: val ? C.violet : null });
    text(label.toUpperCase(), bx + bw / 2, by + 3 + (pressed(id, hov) ? 1 : 0), { font: "caps", colour: val ? C.text : C.dim, align: "center" });
  });
}

// ------------------------------------------------------------------ draw

function drawUI(dt) {
  ui.hot = [];
  ui.bump = Math.max(0, ui.bump - dt);
  ui.counterBump = Math.max(0, ui.counterBump - dt);
  ui.resBump = Math.max(0, ui.resBump - dt);
  if (linkCount > ui.lastLinks) ui.bump = 0.12;
  ui.lastLinks = linkCount;
  drawHUD();
  drawPanel();
  drawTooltip();
}

// windows that take all input: the codex, and dialogs on top of it
function drawOverlays() {
  if (ui.log) drawLog();
  if (ui.codex) drawCodex();
  if (ui.modal) drawModal();
}

// ----------------------------------------------------------------- actions

function buy(s) {
  const n = ui.buyMode === "max" ? maxAffordable(s) : ui.buyMode;
  if (n < 1) return;
  const c = bulkCost(s, n);
  if (c > S.lumen) return;
  S.lumen -= c;
  S.owned[s.id] = (S.owned[s.id] || 0) + n;
  syncCreatures(true);
  arpeggio([s.index + 2, s.index + 4, s.index + 7], 0.045);
}

function buyUpgrade(u) {
  if (S.lumen < u.cost || S.upg.includes(u.id)) return;
  S.lumen -= u.cost;
  S.upg.push(u.id);
  ui.tapTip = null;
  rebuildMods();
  arpeggio([3, 7, 10, 14], 0.05);
  burst(play.cx, play.cy, "#d8c8ff", 30, 90);
}

function toggleMute() {
  S.muted = !S.muted;
  if (AC) { master.gain.value = S.muted ? 0 : 0.9; AC[S.muted ? "suspend" : "resume"](); }
  if (!S.muted) initAudio();
  save();
}

async function askReset() {
  if (await modal("Wipe the reef?", ["Everything - lumen, creatures, pearls, depth and the whole Depth Log - is lost."], "Wipe", "Keep")) {
    localStorage.removeItem(SAVE_KEY);
    S = freshState(); rebuildMods(); creatures = []; links.clear(); resonance = 1; tide.on = false;
    setZone(); tutReset(); buildBackground(); placeProps(); rollSparks(); setDrone(Z);
  }
}

// ------------------------------------------------------------------ input

cvs.addEventListener("pointerdown", e => {
  initAudio();
  const [x, y] = toLogical(e);
  if (descent.active && !ui.modal && !ui.codex) return skipDescent();
  ui.mouse = { x, y, in: true, touch: e.pointerType !== "mouse" };
  cvs.setPointerCapture(e.pointerId);
  const h = hitHot(x, y);
  if (!h || h.id !== ui.tapTip) ui.tapTip = null; // tapping elsewhere closes a touch tooltip
  if (ui.modal || ui.codex || ui.log) { if (h) ui.press = h.id; return; }
  if (h) {
    ui.press = h.id;
    if (h.scroll) ui.drag = { y, scroll: ui.scroll, moved: false };
    return;
  }
  if (x >= play.w || y >= play.h) return;
  if (spore && Math.hypot(x - spore.x, y - spore.y) < 12) return catchSpore();
  if (Math.hypot(x - play.cx, y - play.cy) < HEART_R) return tapHeart();
  if (tapGulper(x, y)) return;
  if (tapShiny(x, y)) return;
  if (grabAnchor(x, y)) return;
  current.on = true; current.x = x; current.y = y;
});

cvs.addEventListener("pointermove", e => {
  const [x, y] = toLogical(e);
  ui.mouse = { x, y, in: true, touch: e.pointerType !== "mouse" };
  if (current.on) { current.x = x; current.y = y; }
  dragAnchor(x, y);
  if (ui.drag) {
    const dy = ui.drag.y - y;
    if (Math.abs(dy) > 3) ui.drag.moved = true;
    if (ui.drag.moved) { ui.scroll = ui.drag.scroll + dy; ui.press = null; }
  }
});

function pointerEnd(e) {
  const [x, y] = toLogical(e);
  if (ui.press) {
    const h = hitHot(x, y);
    if (h && h.id === ui.press && h.onClick && !(ui.drag && ui.drag.moved)) h.onClick();
  }
  ui.press = null; ui.drag = null; current.on = false;
  dropAnchor();
  if (e.pointerType !== "mouse") ui.mouse.in = false;
}
cvs.addEventListener("pointerup", pointerEnd);
cvs.addEventListener("pointercancel", pointerEnd);
cvs.addEventListener("pointerleave", () => { if (!current.on) ui.mouse.in = false; });
cvs.addEventListener("wheel", e => {
  const [x, y] = toLogical(e);
  if (inRect(x, y, panel)) { ui.scroll += Math.sign(e.deltaY) * 12; e.preventDefault(); }
}, { passive: false });

addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (ui.modal) { const m = ui.modal; ui.modal = null; m.res(false); } else if (ui.codex) closeCodex();
    else if (ui.log) closeLog();
  } else if ((e.key === "h" || e.key === "?") && !ui.modal) ui.codex ? closeCodex() : openCodex();
  else if (e.key === "l" && !ui.modal && !ui.codex) ui.log ? closeLog() : openLog();
});
