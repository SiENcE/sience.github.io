/* News cards: when something is found or won (a hermit's boon, castaways, a wreck's
 * driftwood, a pirate's treasure, a secret shape, the voyage's Grand Festival) a card
 * pops up over the island and says what happened and what it brought, with a live
 * picture (the codex's own art).  They queue, one at a time; OK (or Esc, Enter, a
 * click outside) closes one.  Only the game's screen shows them: the sim and the tools
 * never make any.
 */
"use strict";

const cardQueue = [];
// title, sub (a line under it), lines (*gold* words), art(box), icon (a sprite beside the
// title), buttons [{ label, fn, accent, tip }] (default: OK)
function showCard(c) {
  cardQueue.push(c);
  if (!ui.card) nextCard();
}
function nextCard() {
  ui.card = cardQueue.shift() || null;
  if (!ui.card) return;
  ui.card.t = 0;
  ui.sleep = false; ui.tool = null; ui.flyout = null; ui.tapTip = null;
  sfx.page();
}
function closeCard() { const c = ui.card; nextCard(); if (c && c.onClose) c.onClose(); }

function drawNewsCard(dt) {
  const c = ui.card;
  c.t += dt;
  ui.hot = [];
  hotspot(0, 0, VW, VH, "card:out", c.t > 0.6 && !c.buttons ? closeCard : null);
  ctx.fillStyle = ditherPattern(Math.min(8, Math.round(c.t * 40)), "#0a0c18");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(VW - 8, 280), body = (c.lines || []).flatMap(l => wrap(l, w - 20));
  const artH = c.art ? 78 : 0, h = 38 + (c.sub ? 10 : 0) + artH + body.length * 9 + 28;
  // it opens from its middle, and sparkles once it is open
  const k = Math.min(1, c.t / 0.25), e = 1 - (1 - k) * (1 - k);
  const hh = Math.max(8, Math.round(h * e)), x = Math.round((VW - w) / 2), y0 = Math.round((VH - h) / 2), y = Math.round(y0 + (h - hh) / 2);
  hotspot(x, y0, w, h, "card:win", null);
  windowBox(x, y, w, hh);
  if (k < 1) return;
  if (!c.sparked) {
    c.sparked = true;
    for (const [px, py] of [[x + 8, y0 + 8], [x + w - 8, y0 + 8], [x + 8, y0 + h - 8], [x + w - 8, y0 + h - 8]]) burst(px, py, C.gold, 10, 40, true);
  }
  rect(x + 2, y0 + 2, w - 4, 20, C.winLo);
  let ty = y0 + 3;
  if (c.icon && ATLAS.sprites[c.icon]) spriteC(c.icon, x + 14, y0 + 12);
  text(c.title, x + w / 2, ty, { font: "big", colour: C.gold, align: "center" });
  ty = y0 + 25;
  if (c.sub) { text(c.sub, x + w / 2, ty, { colour: C.dim, align: "center" }); ty += 10; }
  if (c.art) {
    const b = { x: x + 8, y: ty, w: w - 16, h: artH - 6 };
    slotBox(b.x, b.y, b.w, b.h);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x + 2, b.y + 2, b.w - 4, b.h - 4); ctx.clip();
    rect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, "#4a9fc0");
    c.art({ x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 });
    ctx.restore();
    ty += artH;
  }
  body.forEach((l, i) => rich(l, x + 10, ty + i * 9, C.text));
  const btns = c.buttons || [{ label: "OK", fn: null, accent: C.gold }];
  const bw = Math.min(84, Math.floor((w - 16 - (btns.length - 1) * 6) / btns.length)), total = btns.length * bw + (btns.length - 1) * 6;
  btns.forEach((bt, i) => smallButton("card:b" + i, Math.round(x + (w - total) / 2 + i * (bw + 6)), y0 + h - 18, bw, bt.label,
    () => { closeCard(); if (bt.fn) bt.fn(); sfx.click(); }, { accent: bt.accent || null, tip: bt.tip || null }));
}

// ------------------------------------------------------------------ what makes a card

// an event found by a walk (events.js's P.event): what it was, and what it brought
function eventCard(o) {
  const hermitBoon = o.boon && BOONS.find(b => b.id === o.boon);
  const C0 = {
    hermit: { title: "THE HERMIT", sub: "at the end of the stranger's footprints", art: artStranger,
      lines: hermitBoon ? [`An old hermit lives out here. They give the voyage a boon: *${hermitBoon.name}*.`, hermitBoon.desc]
        : [`An old hermit lives out here, and gives the village a purse of *${o.gift.coin || 0} coins*.`] },
    shrine: { title: "A SHRINE", sub: "at the end of the stranger's footprints", art: b => artSecret(b, "shrine", false),
      lines: ["An old shrine by the woods, forgotten for years.", "A *secret*: its page is in the codex (SECRETS), with a gift."] },
    boat: { title: "CASTAWAYS", sub: "at the end of the stranger's footprints", art: artCastaways,
      lines: [`*${o.join} castaways* were camped here by their boat. They join the village, and sleep by the hearth until a bed is free.`] },
    wreck: { title: "THE WRECK", sub: "on the sandbar", art: artWreck,
      lines: [`Driftwood from the wreck: *+${o.gift.wood || 0} wood*.`, "And someone clinging on: *a castaway* joins the village."] },
    treasure: { title: "TREASURE!", sub: "the pirates' chest, dug up", art: artTreasure,
      lines: [`A chest of pirate gold: *+${o.gift.coin || 0} coins*` + (o.hat ? ", and a pirate's *tricorn hat* some villagers will wear." : ".")] },
  }[o.kind || o.id];
  if (C0) showCard({ ...C0, icon: null });
}
// a secret shape, the first time anywhere (its gift) or again on this island
function secretCard(f) {
  const sec = SECRETS.find(s => s.id === f.id), g = COSMETICS[sec.gift];
  showCard({ title: "A SECRET", sub: sec.name, art: b => artSecret(b, sec.id, false),
    lines: [sec.desc, f.first ? `Found for the first time: *${g.name}*, ${g.kind === "hat" ? "a hat some villagers now wear" : "a cobble pattern (the codex, SECRETS: PAVE HERE)"}.` : "Found again, on this island too."] });
}

// ------------------------------------------------------------------ card art

function artCastaways(b) {
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 38), [bx, by] = at(3, 0);
  spriteB("boat", bx, by + 12); flame(bx - 8, by + 13, 3);
  for (let k = 0; k < 2; k++) artWalker(bx - 20 - k * 10, by + 10 + (k % 2), 7 + k * 5, null, k === 1);
  spriteB("pine", at(4, 0)[0] + 6, at(4, 0)[1] + 4);
}
function artTreasure(b) {
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 38), [cx, cy] = at(2, 0), ph = (now * 0.5) % 1;
  // the dig: earth thrown up, then the chest
  for (let k = 0; k < 6; k++) rect(cx - 6 + k * 2, cy + 7 + (k % 2), 2, 1, "#7c5230");
  spriteB(ATLAS.sprites.chest ? "chest" : "boat", cx, cy + 12);
  for (let k = 0; k < 5; k++) { const t = (ph + k / 5) % 1; rect(Math.round(cx - 6 + k * 3), Math.round(cy - 2 - t * 14), 1, 1, t < 0.5 ? C.gold : "#fff4c8"); }
  spriteB(ATLAS.sprites.pirateship ? "pirateship" : "ship", b.x + b.w - 30, b.y + 36 + Math.round(Math.sin(now * 2)), true);
  artWalker(cx + 14, cy + 10, 11);
}
