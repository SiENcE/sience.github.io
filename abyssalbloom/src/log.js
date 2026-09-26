/* The Depth Log window: the tree, trials, secrets, relics and bestiary.
 * Drawn like the codex (immediate mode, square bevelled boxes); opens from the
 * black-pearl button in the footer or with L, and closes with Esc.
 */
"use strict";

const LOG_TABS = [["tree", "TREE"], ["trials", "TRIALS"], ["secrets", "SECRETS"], ["relics", "RELICS"], ["beasts", "BEASTS"]];

const logShown = () => S.black > 0 || S.tree.length > 0 || S.relics.length > 0 || S.trials.length > 0 || S.depth > 0;
// a gold dot on the button while there is a node you could buy
const logNews = () => TREE_NODES.some(n => treeOpen(n) && S.black >= n.cost);

function openLog(tab = "tree") {
  ui.log = { tab, sel: null };
  S.logOpened = true;
  ui.tapTip = null;
}
function closeLog() { ui.log = null; ui.tapTip = null; }

// touch: the first tap explains (tooltip), the second one acts
function tapTwice(id, act) {
  return () => {
    if (ui.mouse.touch && ui.tapTip !== id) { ui.tapTip = id; return; }
    ui.tapTip = null;
    act();
  };
}

function drawLog() {
  ui.hot = [];
  hotspot(0, 0, VW, VH, "lg:out", closeLog);
  ctx.fillStyle = ditherPattern(8, "#01040a");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(VW - 10, 344), h = Math.min(VH - 10, panel.portrait ? 420 : 246);
  const x = Math.round((VW - w) / 2), y = Math.round((VH - h) / 2);
  hotspot(x, y, w, h, "lg:win", null);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 13, C.winLo);
  text("DEPTH LOG", x + 7, y + 4, { font: "caps", colour: C.gold });
  // black pearls in the title bar
  const bp = String(S.black), bw = textWidth(bp, "caps");
  text(bp, x + w - 24 - bw, y + 4, { font: "caps", colour: C.violet });
  spriteC("bpearl", x + w - 33 - bw, y + 8);
  const bx = x + w - 17;
  const hv = hotspot(bx, y + 3, 14, 11, "lg:close", closeLog);
  buttonBox(bx, y + 3, 14, 11, { hover: hv, pressed: pressed("lg:close", hv) });
  icon("close", bx + 5, y + 6, C.text);

  // tabs
  const tw = Math.floor((w - 8) / LOG_TABS.length);
  LOG_TABS.forEach(([id, label], i) => {
    const tx = x + 4 + i * tw, on = ui.log.tab === id, hid = "lg:tab:" + id;
    const th = hotspot(tx, y + 18, tw - 1, 13, hid, () => { ui.log.tab = id; ui.log.sel = null; ui.tapTip = null; });
    buttonBox(tx, y + 18, tw - 1, 13, { hover: th, pressed: on || pressed(hid, th) });
    text(label, tx + (tw - 1) / 2, y + 21 + (on ? 1 : 0), { font: "caps", colour: on ? C.cyan : C.dim, align: "center" });
  });

  const box = { x: x + 5, y: y + 35, w: w - 10, h: h - 40 };
  ({ tree: logTree, trials: logTrials, secrets: logSecrets, relics: logRelics, beasts: logBeasts })[ui.log.tab](box);
  drawTooltip();
}

// ------------------------------------------------------------------- tree

function logTree(b) {
  const colW = Math.floor(b.w / 3), rows = 8, rh = Math.min(24, Math.floor((b.h - 12) / rows));
  TREE.forEach((br, ci) => {
    const cx = b.x + ci * colW;
    text(br.name, cx + 1, b.y, { font: "caps", colour: br.colour });
    br.nodes.forEach((n, i) => {
      const node = TREE_NODES.find(t => t.id === n.id), ry = b.y + 11 + i * rh, id = "lg:n:" + n.id;
      const owned = treeHas(n.id), open = treeOpen(node), afford = open && S.black >= n.cost;
      // the connector down to the next node
      if (i < rows - 1) rect(cx + 9, ry + 18, 1, rh - 18, owned ? br.colour : C.winHi);
      const hov = hotspot(cx, ry, colW - 2, 18, id, tapTwice(id, () => buyNode(node)),
        { tip: [n.name.toUpperCase(), n.desc, owned ? "*grown*" : `*${n.cost}* black pearl${n.cost > 1 ? "s" : ""}`] });
      if (owned) bevel(cx, ry, 18, 18, "#2a2150", br.colour, C.winLo);
      else if (afford) buttonBox(cx, ry, 18, 18, { hover: hov, pressed: pressed(id, hov), accent: br.colour });
      else slotBox(cx, ry, 18, 18);
      if (owned || open) spriteC(n.icon, cx + 9, ry + 9);
      else { const [iw, ih] = spriteSize(n.icon); silhouette(n.icon, cx + 9 - iw / 2, ry + 9 - ih / 2, "#1d3450"); }
      const name = fitText(n.name, colW - 24);
      text(name, cx + 21, ry + 1, { colour: owned ? C.text : open ? C.dim : C.faint });
      if (owned) text("grown", cx + 21, ry + 10, { colour: br.colour });
      else text(`${n.cost}`, cx + 21, ry + 10, { colour: afford ? C.gold : open ? "#8a6f5a" : C.faint });
      if (ui.tapTip === id) { rect(cx, ry, 18, 1, C.cyan); rect(cx, ry + 17, 18, 1, C.cyan); }
    });
  });
}

// cut a string to a width, with an ellipsis of dots
function fitText(s, maxW, font = "small") {
  if (textWidth(s, font) <= maxW) return s;
  while (s.length > 1 && textWidth(s + "..", font) > maxW) s = s.slice(0, -1);
  return s + "..";
}

// ----------------------------------------------------------------- trials

function logTrials(b) {
  const two = b.w >= 300, cols = two ? 2 : 1, colW = Math.floor(b.w / cols);
  const perCol = Math.ceil(TRIALS.length / cols), rh = Math.min(two ? 28 : 20, Math.floor(b.h / perCol));
  TRIALS.forEach((t, i) => {
    const cx = b.x + Math.floor(i / perCol) * colW, ry = b.y + (i % perCol) * rh;
    const done = S.trials.includes(t.id), open = trialOpen(t), possible = trialPossible(t);
    slotBox(cx, ry + 1, 10, 10);
    if (done) { rect(cx + 2, ry + 3, 6, 6, C.gold); rect(cx + 3, ry + 4, 4, 4, "#fff3c8"); }
    const reward = `${t.reward || 2}`, rw = textWidth(reward) + 10;
    if (!open) {
      text("???", cx + 14, ry + 2, { font: "caps", colour: C.faint });
      text(fitText("opens at " + zoneDef(t.from).name, colW - 20), cx + 14, ry + 11, { colour: C.faint });
      return;
    }
    text(fitText(t.name.toUpperCase(), colW - 18 - rw, "caps"), cx + 14, ry + 2, { font: "caps", colour: done ? C.gold : C.text });
    spriteC("bpearl", cx + colW - rw, ry + 6);
    text(reward, cx + colW - rw + 6, ry + 2, { colour: done ? C.faint : C.violet });
    const lines = wrap(t.desc + (t.mech && !possible && !done ? `  (needs ${t.mech})` : ""), colW - 18);
    lines.slice(0, two ? 2 : 1).forEach((l, j) => text(j === 0 && !two && lines.length > 1 ? fitText(l + " " + lines[1], colW - 18) : l,
      cx + 14, ry + 11 + j * 8, { colour: done ? C.faint : possible ? C.dim : C.faint }));
  });
}

// ---------------------------------------------------------------- secrets

function logSecrets(b) {
  const rh = Math.min(34, Math.floor(b.h / SECRETS.length));
  text(`${S.secrets.length} of ${SECRETS.length} found. More lie deeper.`, b.x + 1, b.y, { colour: C.faint });
  SECRETS.forEach((s, i) => {
    const ry = b.y + 12 + i * rh, found = S.secrets.includes(s.id);
    if (found) {
      text(s.name.toUpperCase(), b.x + 1, ry, { font: "caps", colour: C.violet });
      rich("gave: *" + s.gives + "*", b.x + 1, ry + 9, C.dim);
    } else {
      text("???", b.x + 1, ry, { font: "caps", colour: C.faint });
      text(fitText(s.hint, b.w - 4), b.x + 1, ry + 9, { colour: C.dim });
    }
  });
}

// ----------------------------------------------------------------- relics

function logRelics(b) {
  text(`WORN ${S.equip.length}/${M.relicSlots}`, b.x + 1, b.y, { font: "caps", colour: C.dim });
  text("more slots grow on the Heart branch", b.x + b.w - 1, b.y, { colour: C.faint, align: "right" });
  const rh = Math.min(36, Math.floor((b.h - 12) / RELICS.length));
  RELICS.forEach((r, i) => {
    const ry = b.y + 12 + i * rh, have = relicHas(r.id), worn = S.equip.includes(r.id), id = "lg:r:" + r.id;
    slotBox(b.x, ry, 30, 30);
    if (have) spriteC("rb_" + r.id, b.x + 15, ry + 15);
    else { const [iw, ih] = spriteSize("rb_" + r.id); silhouette("rb_" + r.id, b.x + 15 - iw / 2, ry + 15 - ih / 2, "#1d3450"); }
    if (worn) brackets(b.x, ry, 30, 30, C.gold);
    text(have ? r.name.toUpperCase() : "???", b.x + 35, ry + 4, { font: "caps", colour: have ? (worn ? C.gold : C.text) : C.faint });
    text(fitText(have ? r.desc : "Found through a secret.", b.w - 90), b.x + 35, ry + 15, { colour: have ? C.dim : C.faint });
    if (!have) return;
    const full = !worn && S.equip.length >= M.relicSlots, bw = 44, bxx = b.x + b.w - bw;
    const hov = hotspot(bxx, ry + 8, bw, 13, id, () => toggleRelic(r.id),
      full ? { tip: ["NO FREE SLOT", "Take another relic off first, or grow a slot on the Heart branch."] } : {});
    buttonBox(bxx, ry + 8, bw, 13, { hover: hov, pressed: pressed(id, hov), disabled: full });
    text(worn ? "REMOVE" : "WEAR", bxx + bw / 2, ry + 11, { font: "caps", colour: full ? C.faint : worn ? C.dim : C.gold, align: "center" });
  });
}

// ---------------------------------------------------------------- bestiary

function logBeasts(b) {
  const seen = BEASTS.filter(x => S.best[x.id] && S.best[x.id].seen).length;
  const next = (S.bestPaid + 1) * 4;
  text(`SEEN ${seen}/${BEASTS.length}`, b.x + 1, b.y, { font: "caps", colour: C.dim });
  if (next <= BEASTS.length) text(`2 black pearls at ${next}`, b.x + b.w - 1, b.y, { colour: C.faint, align: "right" });
  const cell = 26, per = Math.floor(b.w / cell);
  BEASTS.forEach((x, i) => {
    const cx = b.x + (i % per) * cell, cy = b.y + 12 + Math.floor(i / per) * cell, e = S.best[x.id], id = "lg:b:" + x.id;
    const hov = hotspot(cx, cy, cell - 2, cell - 2, id, () => (ui.log.sel = x.id));
    if (hov) ui.log.sel = x.id;
    (ui.log.sel === x.id ? buttonBox : slotBox)(cx, cy, cell - 2, cell - 2, { pressed: true });
    if (e && e.seen) spriteC(x.icon, cx + (cell - 2) / 2, cy + (cell - 2) / 2);
    else { const [iw, ih] = spriteSize(x.icon); silhouette(x.icon, cx + (cell - 2 - iw) / 2, cy + (cell - 2 - ih) / 2, "#1d3450"); }
    if (e && e.shiny) rect(cx + cell - 7, cy + 3, 2, 2, C.gold);
  });
  const rows = Math.ceil(BEASTS.length / per), iy = b.y + 16 + rows * cell;
  const sel = BEASTS.find(x => x.id === ui.log.sel), e = sel && S.best[sel.id];
  if (sel) {
    text(e && e.seen ? sel.name.toUpperCase() : "???", b.x + 1, iy, { font: "caps", colour: e && e.seen ? C.text : C.faint });
    if (e && e.seen) {
      text(sel.desc, b.x + 1, iy + 10, { colour: C.dim });
      if (e.shiny) text("a shiny one has been catalogued", b.x + 1, iy + 19, { colour: C.gold });
    }
  } else text("Shiny ones are rare. Touch one to catalogue it.", b.x + 1, iy, { colour: C.faint });
}
