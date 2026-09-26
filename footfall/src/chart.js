/* The sea chart: every island of the voyage on parchment, the routes sailed, and
 * the choices made when the ship sails (voyage.js does the sailing itself).
 *
 * Opened read-only from the corner button (look at the voyage, visit a settled
 * island), or to depart when the ship is ready: pick one of two islands, then the
 * boons (more with charters met), then an heirloom, and SET SAIL.  Immediate mode
 * like every other menu, drawn over the island.
 */
"use strict";

const chart = { mode: "view", step: "island", sel: null, boons: [], heirloom: null, thumbs: new Map() };

function openChart(mode = "view") {
  if (day.on && mode === "depart") return;
  if (mode === "depart") offerIslands();
  Object.assign(chart, { mode, step: "island", sel: mode === "depart" ? null : activeNode().id, boons: [], heirloom: null });
  ui.chart = true; ui.tool = null; ui.flyout = null; ui.tapTip = null;
  sfx.page();
}
function closeChart() { ui.chart = false; }

// an island's thumbnail codes: the island being played, a settled one as it was
// left, or one on offer as it would be made
function nodeCodes(n) {
  if (n.status === "active" && !visiting) return { n: N, codes: thumbCodes(S) };
  const isl = W.islands.find(i => i.node === n.id);
  if (isl) {
    if (!chart.thumbs.has("s" + n.id)) chart.thumbs.set("s" + n.id, { n: isl.n, codes: frozenCodes(isl) });
    return chart.thumbs.get("s" + n.id);
  }
  if (!chart.thumbs.has("o" + n.id)) chart.thumbs.set("o" + n.id, previewIsland({ ...W.settings, seed: n.seed, size: n.size, traits: n.traits }));
  return chart.thumbs.get("o" + n.id);
}
function frozenCodes(isl) {
  const f = isl.frozen;
  return thumbCodes({ n: isl.n, ground: f.ground, feat: f.feat, soil: f.soil, cob: f.cob, height: f.height,
    wear: [...f.lvl].map(c => [0, 2, 6, 14][+c]), b: f.b.map(([, t, x, y]) => ({ t, x, y })) });
}

// ------------------------------------------------------------------ drawing

function drawChart() {
  ui.hot = [];
  hotspot(0, 0, VW, VH, "ch:bg", null);
  if (IMG.chart) {
    const s = Math.max(VW / IMG.chart.width, VH / IMG.chart.height), w = Math.ceil(IMG.chart.width * s), h = Math.ceil(IMG.chart.height * s);
    ctx.drawImage(IMG.chart, Math.round((VW - w) / 2), Math.round((VH - h) / 2), w, h);
  } else rect(0, 0, VW, VH, "#e8dcc0");

  // the header: world, chapter, realm
  const L = W.settings.length, head = `${W.name.toUpperCase()}   CHAPTER ${W.voyage.chapter}${L && !W.voyage.endless ? " OF " + L : W.voyage.endless || !L ? " (ENDLESS)" : ""}   REALM ${realmPop()}`;
  bevel(4, 4, VW - 8, 15, C.win, C.winHi, C.winLo);
  text(head, 10, 8, { font: "caps", colour: C.gold });
  const cx = VW - 19, hv = hotspot(cx, 5, 14, 13, "ch:close", chart.mode === "depart" && chart.step !== "island" ? chartBack : closeChart,
    { tip: chart.mode === "depart" && chart.step !== "island" ? ["BACK", "The step before."] : ["CLOSE", "Back to the island. Key: Esc"] });
  buttonBox(cx, 5, 14, 13, { hover: hv, pressed: pressed("ch:close", hv) });
  icon(chart.mode === "depart" && chart.step !== "island" ? "left" : "close", cx + 5, 9, C.text);

  if (chart.mode === "depart" && chart.step === "boon") return drawBoonStep();
  if (chart.mode === "depart" && chart.step === "heirloom") return drawHeirloomStep();

  // the routes, then the islands
  const nodes = W.chart.nodes, L0 = layoutNodes();
  for (const [a, b] of W.chart.edges) {
    const pa = L0.get(a), pb = L0.get(b), nb = nodes.find(n => n.id === b);
    if (pa && pb) dottedLine(pa.x, pa.y, pb.x, pb.y, nb.status === "closed" ? "#b8a888" : "#5a4630", nb.status === "open" ? 2 : 3);
    else if (pb) dottedLine(8, pb.y, pb.x, pb.y, "#5a4630", 3); // the route from the islands off the chart's edge
  }
  if (L0.first) text(`< ${L0.first} more`, 8, VH / 2 - 30, { colour: "#5a4630", shadow: "#f4e8c8" });
  for (const n of nodes) if (L0.has(n.id)) drawNode(n, L0.get(n.id));
  drawNodeCard();
  if (chart.mode === "depart") {
    const w = textWidth("CHOOSE THE NEXT ISLAND", "caps") + 16;
    bevel(Math.round(VW / 2 - w / 2), 24, w, 14, C.win, C.winHi, C.winLo);
    text("CHOOSE THE NEXT ISLAND", VW / 2, 27, { font: "caps", colour: C.gold, align: "center" });
  }
}

// columns by chapter, rows by the route's branching, scaled to the screen.  A long
// voyage shows its last few chapters (as many columns as fit), the rest off to the left
function layoutNodes() {
  const all = W.chart.nodes, fit = Math.max(3, Math.floor((VW - 40) / 64)), last = Math.max(...all.map(n => n.x)), first = Math.max(0, last + 1 - (fit - 1));
  const nodes = all.filter(n => n.x >= first), cols = Math.max(3, last - first + 2);
  const ys = nodes.map(n => n.y), top = Math.min(-1.5, ...ys), bot = Math.max(1.5, ...ys);
  const colW = Math.min(150, (VW - 40) / cols), rowH = Math.min(70, (VH - 130) / (bot - top + 1));
  const x0 = Math.round((VW - colW * (cols - 1)) / 2), y0 = 50 + (VH - 150) / 2 - ((top + bot) / 2) * rowH;
  const L = new Map(nodes.map(n => [n.id, { x: Math.round(x0 + (n.x - first) * colW), y: Math.round(y0 + n.y * rowH) }]));
  L.first = first; L.x0 = x0;
  return L;
}
function dottedLine(ax, ay, bx, by, colour, gap) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay));
  ctx.fillStyle = colour;
  for (let i = 0; i <= n; i += gap + 1) ctx.fillRect(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), 2, 1);
}

function drawNode(n, p) {
  const t = nodeCodes(n), k = Math.min(2, Math.max(1, Math.floor(Math.min(150, VW / 6) / (2 * t.n)))), c = thumbCanvas(t.codes, t.n, k);
  const w = Math.max(c.width + 8, 52), h = c.height + 8, x = p.x - w / 2, y = p.y - h / 2, id = "ch:n:" + n.id;
  const hv = hotspot(x, y - 2, w, h + 22, id, () => pickNode(n), { tip: nodeTip(n) });
  if (n.status === "closed") ctx.globalAlpha = 0.35;
  const sel = chart.sel === n.id;
  bevel(x, y, w, h, sel ? "#f4e8c8" : "#e6d6b0", "#fff4dc", "#b8a078", "#5a4630");
  ctx.drawImage(c, Math.round(p.x - c.width / 2), Math.round(p.y - c.height / 2));
  if (n.status === "active" && Math.floor(now * 2) % 2) brackets(x, y, w, h);
  if (n.status === "open" && (hv || sel)) brackets(x, y, w, h, "#5a4630");
  text(n.name, p.x, y + h + 3, { colour: "#3a2a1c", align: "center", shadow: "#f4e8c8" });
  // the traits as little pictures (their names are in the tooltip)
  n.traits.forEach((t, k) => traitIcon(t, Math.round(p.x - n.traits.length * 6 + k * 12 + 1), y + h + 12));
  if (n.status === "settled") icon("check", x + w - 8, y + 2, C.green);
  ctx.globalAlpha = 1;
}
// 9x9 pictures of the traits for the chart, in ink and a colour or two
const TRAIT_ICON = {
  meadow: [".........", "..p...p..", ".ppp.ppp.", "..p.g.p..", "....g....", "..g.g.g..", "...ggg...", "....g....", "gggggggg."],
  stony: [".........", ".........", "...kkk...", "..kssk...", ".kssssk..", ".ksssskk.", "kssssssk.", "kkkkkkkkk", "........."],
  marsh: [".g...g...", ".g.g.g.g.", ".g.g.g.g.", "gg.g.ggg.", ".g.g.g.g.", ".bbbbbbb.", "bbbbbbbbb", ".bbbbbbb.", "........."],
  ruins: [".........", ".k.....k.", ".s.kkk.s.", ".s.s.s.s.", ".s.s.s.s.", ".s.....s.", ".s..s..s.", "kkkkkkkkk", "........."],
  highlands: [".........", "....w....", "...wkk...", "..kkkkk..", "..kgkkkk.", ".kggkkkk.", ".kgggkkkk", "kgggggkkk", "ggggggggg"],
  tidal: [".........", ".b...b...", "b.b.b.b.b", "...b...b.", ".........", "yyyyyy...", ".yyyyyyy.", "bbbyyyyyy", "bbbbbbbbb"],
  storm: ["..kkk....", ".kkkkkk..", "kkkkkkkkk", ".kkkkkkk.", "....y....", "...yy....", "....yy...", ".....y...", "....y...."],
  snow: ["....w....", ".w..w..w.", "..w.w.w..", "...www...", "wwwwwwwww", "...www...", "..w.w.w..", ".w..w..w.", "....w...."],
  atoll: ["..ggg....", ".g.k.g...", "...k.....", "..yk.....", ".yyyyyy..", "yybbbbyy.", "ybbbbbbby", "yybbbbyy.", ".yyyyyy.."],
  twin: [".........", "..gg.....", ".gggg....", "bbbbbbbbb", "kkkkkkkkk", "bbbbbbbbb", "....ggg..", "...ggggg.", "..ggggggg"],
  great: [".........", "y.y.y.y..", "yyyyyyy..", "ykykyky..", "yyyyyyy..", ".........", "..g...g..", ".ggg.ggg.", "ggggggggg"],
};
const TRAIT_COL = { p: "#e0607a", g: "#4f8a3c", k: "#3a2a1c", s: "#9a958a", b: "#3f8fb4", w: "#ffffff", y: "#d8b860" };
function traitIcon(t, x, y) {
  const m = TRAIT_ICON[t];
  if (!m) return;
  m.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") rect(x + i, y + j, 1, 1, TRAIT_COL[row[i]]); });
}
function nodeTip(n) {
  const isl = W.islands.find(i => i.node === n.id);
  const lines = n.traits.map(t => `*${TRAITS[t].name}*: ${TRAITS[t].desc}`);
  if (isl) lines.unshift(`Settled: *${isl.peak}* villagers after ${isl.days} days. Sends tribute every ${TRIBUTE_EVERY} days.`);
  else lines.unshift(`Chapter ${n.chapter}, ${n.size} x ${n.size} tiles.` + (n.status === "closed" ? " The ship sailed elsewhere." : ""));
  return [n.name.toUpperCase(), ...lines];
}
const secretNames = ids => ids.map(id => "*" + SECRETS.find(s => s.id === id).name + "*").join(", ");
function pickNode(n) {
  chart.sel = n.id;
  sfx.click();
}

// the card for the chosen island: what it is, and what can be done with it
function drawNodeCard() {
  const n = W.chart.nodes.find(o => o.id === chart.sel);
  if (!n) return;
  const isl = W.islands.find(i => i.node === n.id), w = Math.min(VW - 8, 300), x = Math.round((VW - w) / 2);
  const lines = [];
  if (isl) {
    lines.push(`Settled after *${isl.days} days*: *${isl.peak} villagers*, ${isl.stats.cobbles} cobbles, ${isl.stats.houses} houses.`);
    const t = Object.entries(isl.tribute).map(([r, v]) => `${v} ${r}`).join(", ");
    lines.push(`Tribute every ${TRIBUTE_EVERY} days: ${t}, and a settler.`);
    if (isl.charters.length) lines.push("Charters met: " + isl.charters.map(id => Object.values(CHARTERS).flat().find(c => c.id === id).name).join(", ") + ".");
    if ((isl.secrets || []).length) lines.push("Secrets found: " + secretNames(isl.secrets) + ".");
    const tr = isl.trade || { level: 0 };
    lines.push(tr.level ? `Trade *level ${tr.level}*: its tribute is *x${tradeMult(isl)}*.` + (tr.ask ? ` It asks for *${tr.ask.n} ${tr.ask.res}* by day ${tr.ask.until}.` : "")
      : tr.ask ? `It asks for *${tr.ask.n} ${tr.ask.res}* by day ${tr.ask.until}: answer it and trade grows.` : "Now and then it writes to ask for something: answered, its trade grows.");
  } else if (n.status === "active") {
    lines.push(`Chapter ${n.chapter}: reach *${S.goal} villagers*` + (lastChapter() ? ": the *Grand Festival*, and the voyage is complete." : ", then build the ship."));
    for (const c of islandCharters()) lines.push(`${charterStat(c.stat) >= c.goal ? "+" : "-"} charter *${c.name}*: ${c.desc} (${Math.min(c.goal, charterStat(c.stat))}/${c.goal})`);
    if ((S.secrets || []).length) lines.push("Secrets found here: " + secretNames(S.secrets) + ".");
  } else {
    for (const t of n.traits) lines.push(`*${TRAITS[t].name}*: ${TRAITS[t].desc}`);
    if (n.chapter === W.settings.length) lines.push(`The voyage's *last island*: its goal is the Grand Festival (*${chapterGoal(n.chapter)} villagers*).`);
    lines.push(`${n.size} x ${n.size} tiles; charters: ${n.traits.flatMap(t => CHARTERS[t]).slice(0, 2).map(c => c.name).join(", ")}.`);
  }
  const wrapped = lines.flatMap(l => wrap(l, w - 16)), h = 20 + wrapped.length * 9 + 20, y = VH - h - 4;
  windowBox(x, y, w, h);
  text(n.name.toUpperCase(), x + 7, y + 5, { font: "caps", colour: C.gold });
  wrapped.forEach((l, i) => rich(l, x + 7, y + 17 + i * 9, C.dim));
  const by = y + h - 17;
  if (isl) smallButton("ch:visit", x + w - 64, by, 60, "VISIT", () => startVisit(isl), { tip: ["VISIT", "See the island as you left it, its last day playing out. Nothing there can change."] });
  if (chart.mode === "depart" && n.status === "open")
    smallButton("ch:go", x + w - 84, by, 80, "SAIL HERE", () => { chart.step = "boon"; chart.boons = []; sfx.click(); }, { accent: C.gold });
}

// step 2: the boons, one (and one more for each charter met) of those on offer
function drawBoonStep() {
  const offer = offerBoons(), picks = 1 + chartersMet().length;
  stepHeader(`CHOOSE ${picks > 1 ? picks + " BOONS" : "A BOON"}`, picks > 1 ? `${picks - 1} charter${picks > 2 ? "s" : ""} met: one more boon each.` : "It lasts the whole voyage.");
  const cards = offer.map(b => ({ id: b.id, name: b.name, desc: b.desc, on: chart.boons.includes(b.id) }));
  drawChoiceCards(cards, id => {
    if (chart.boons.includes(id)) chart.boons = chart.boons.filter(o => o !== id);
    else if (chart.boons.length < picks) chart.boons.push(id);
    else chart.boons = [...chart.boons.slice(1), id];
    sfx.click();
  });
  // a reroll bought from the night merchant is free, and doesn't count as this departure's
  const by = VH - 24, cost = rerollCost(), token = (W.voyage.tokens || 0) > 0;
  smallButton("ch:reroll", VW / 2 - 84, by, 80, token ? "REROLL FREE" : `REROLL ${cost}`, () => {
    if (token) { W.voyage.tokens--; W.voyage.rerolls++; chart.boons = []; return sfx.click(); }
    if (S.coin < cost || W.voyage.rerolled) return sfx.nope();
    S.coin -= cost; W.voyage.rerolls++; W.voyage.rerolled = true; chart.boons = []; sfx.click();
  }, { disabled: !token && (S.coin < cost || !!W.voyage.rerolled), tip: ["REROLL", token ? `Other boons, free: a reroll from the night merchant (${W.voyage.tokens} left).` : `Other boons, for ${cost} coins. Once per departure.`] });
  smallButton("ch:next", VW / 2 + 4, by, 80, "NEXT", () => { if (chart.boons.length === picks) { chart.step = "heirloom"; sfx.click(); } else sfx.nope(); },
    { accent: C.gold, disabled: chart.boons.length !== picks });
}

// step 3: an heirloom, and who sails
function drawHeirloomStep() {
  const offer = offerHeirlooms(), crew = S.vil.filter(v => defaultCrew().includes(v.id));
  stepHeader("TAKE AN HEIRLOOM", "A different shape of something you know. Then the crew sets sail.");
  drawChoiceCards(offer.map(h => ({ id: h.id, name: h.name, desc: h.desc, on: chart.heirloom === h.id })), id => { chart.heirloom = id; sfx.click(); });
  const names = crew.map(v => v.name).join(", "), w = Math.min(VW - 16, 360), lines = wrap(`The crew: *${crew.length}* villagers (${names}), with food, wood and a few coins.`, w - 12);
  lines.forEach((l, i) => rich(l, VW / 2 - w / 2 + 6, VH - 40 - lines.length * 9 + i * 9, "#3a2a1c", "#f4e8c8"));
  smallButton("ch:sail", VW / 2 - 50, VH - 24, 100, "SET SAIL", () => {
    if (!chart.heirloom && offer.length) return sfx.nope();
    setSail();
  }, { accent: C.gold, disabled: !chart.heirloom && offer.length > 0 });
}

function stepHeader(title, sub) {
  const w = Math.min(VW - 16, Math.max(textWidth(title, "caps"), textWidth(sub)) + 20), x = Math.round(VW / 2 - w / 2);
  bevel(x, 26, w, 26, C.win, C.winHi, C.winLo);
  text(title, VW / 2, 29, { font: "caps", colour: C.gold, align: "center" });
  text(sub, VW / 2, 40, { colour: C.dim, align: "center" });
}
function drawChoiceCards(cards, onPick) {
  const cw = Math.min(150, Math.floor((VW - 16 - (cards.length - 1) * 6) / cards.length)), ch = 70;
  const total = cards.length * cw + (cards.length - 1) * 6, x0 = Math.round((VW - total) / 2), y = Math.round(VH / 2 - ch / 2);
  cards.forEach((c, i) => {
    const x = x0 + i * (cw + 6), id = "ch:c:" + c.id, hv = hotspot(x, y, cw, ch, id, () => onPick(c.id));
    bevel(x, y, cw, ch, c.on ? "#3b4670" : C.win, c.on ? C.gold : C.winHi, C.winLo);
    const f = fitLabel(c.name.toUpperCase(), cw - 8);
    text(f.s, x + cw / 2, y + 6, { font: f.font, colour: c.on ? C.gold : C.text, align: "center" });
    wrap(c.desc, cw - 12).forEach((l, k) => rich(l, x + 6, y + 18 + k * 9, C.dim));
    if (hv && !c.on) brackets(x, y, cw, ch, C.sky);
  });
}
function chartBack() { chart.step = chart.step === "heirloom" ? "boon" : "island"; sfx.click(); }

// the ship sails: voyage.js freezes this island and lands the crew on the chosen one
function setSail() {
  const from = S.name;
  sail({ node: chart.sel, boons: chart.boons, heirloom: chart.heirloom });
  delete W.voyage.rerolled;
  chart.thumbs.clear();
  ui.chart = false;
  enterIsland();
  save();
  sfx.milestone();
  screenText(VW / 2, VH / 2 - 60, "LANDFALL", C.gold, "big", 3.5);
  screenText(VW / 2, VH / 2 - 40, `${S.name}: the crew from ${from} comes ashore`, C.text, "small", 3.5);
}

// ------------------------------------------------------------------ visits

// a settled island, thawed for looking at: its last day replays, nothing is kept
let visitBack = null;
function startVisit(isl) {
  const f = isl.frozen;
  visitBack = { S, N };
  N = isl.n;
  const wear = [...f.lvl].map(c => [0, 2.5, 7, 15][+c]);
  const b = f.b.map(([id, t, x, y, look]) => ({ id, t, x, y, look, age: 99 }));
  const vil = f.vil.map(([id, home, look, name]) => ({ id, home, look, name }));
  S = { v: 1, n: isl.n, seed: isl.seed, day: isl.days, food: 999, wood: 0, coin: 0, goods: 999, stone: 0, clay: 0, chapter: isl.chapter,
    traits: isl.traits, goal: 0, goalMet: true, ground: f.ground, feat: f.feat, soil: f.soil, cob: f.cob, deco: f.deco, ghost: f.ghost || "0".repeat(N * N),
    ...(f.height ? { height: f.height } : {}), late: [], wool: 0, scar: f.scar || [], pattern: f.pattern || "cobble", secrets: isl.secrets || [], ev: null, shop: null,
    wear, foot: new Array(N * N).fill(0), b, nextId: 9999, vil, nextV: 9999, ms: MILESTONES.length, seen: true, cam: null, t: 0,
    stats: { ...isl.stats }, name: isl.name, node: isl.node };
  visiting = isl;
  ui.chart = false;
  enterIsland();
}
function endVisit() {
  if (!visiting) return;
  day.on = false;
  ({ S, N } = visitBack);
  visiting = null; visitBack = null;
  enterIsland();
  openChart("view");
}
// over the island while visiting: its name and the way back
function drawVisitBar() {
  const s = `${visiting.name.toUpperCase()}, AS YOU LEFT IT`, w = textWidth(s, "caps") + 80, x = Math.round((VW - w) / 2);
  windowBox(x, 4, w, 17);
  text(s, x + 7, 8, { font: "caps", colour: C.gold });
  smallButton("visit:back", x + w - 62, 6, 58, "BACK", endVisit, { tip: ["BACK", "Back to the chart."] });
}
