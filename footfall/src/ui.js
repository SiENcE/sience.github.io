/* Pixel menus, drawn into the same low-res canvas as the island.
 *
 * Immediate mode: every frame the HUD, build bar, tooltip and dialog are drawn
 * and register their clickable rectangles ("hotspots"); input is matched against
 * the rectangles of the frame the player is looking at.  The map itself is not a
 * hotspot: a click that hits no hotspot goes to the tile under the pointer.
 */
"use strict";

const ui = {
  hot: [], press: null, drag: null, tool: null, hover: null, tapTip: null, tapTile: null,
  mouse: { x: -1, y: -1, wx: -1, wy: -1, in: false, touch: false }, modal: null, card: null, stats: null, codex: null, shop: false, fast: false,
  bump: {}, preview: null, inspected: null, panned: 0, title: true, menu: "title", paths: false, flyout: null, sleep: false,
};
let forecast = null;
function refreshForecast() { forecast = plan(); ui.preview = null; }

const inRect = (x, y, r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
function hotspot(x, y, w, h, id, onClick, extra = {}) {
  const r = { x, y, w, h };
  ui.hot.push({ ...r, id, onClick, ...extra });
  return ui.mouse.in && !ui.mouse.touch && inRect(ui.mouse.x, ui.mouse.y, r);
}
const hitHot = (x, y) => { for (let i = ui.hot.length - 1; i >= 0; i--) if (inRect(x, y, ui.hot[i])) return ui.hot[i]; return null; };
const pressed = (id, hover) => ui.press === id && (hover || ui.mouse.touch);

// text with *starred* words in gold (on parchment: dark ink, a light shadow, and the
// starred words in a darker gold that reads there)
function rich(line, x, y, colour = C.text, shadow = C.ink) {
  let gold = false;
  const accent = shadow === C.ink ? C.gold : "#9a5a10";
  for (const part of line.split("*")) {
    x += text(part, x, y, { colour: gold ? accent : colour, shadow });
    gold = !gold;
  }
}
const plain = s => s.replace(/\*/g, "");
const signed = n => (n > 0 ? "+" + n : String(n));

// ------------------------------------------------------------------- HUD

function drawHUD(dt) {
  for (const k in ui.bump) ui.bump[k] = Math.max(0, ui.bump[k] - dt);
  // resources, with tomorrow's forecast change
  // (a trait's good only where it is made or kept)
  const TRADE = { stone: "stony", clay: "marsh", wool: "highlands", pearl: "atoll" };
  const res = RES.filter(r => (r === "food" || r === "wood") || (revealed(r) > 0.5 && (!TRADE[r] || S[r] > 0 || S.traits.includes(TRADE[r]))));
  // each cell grows with its number, so big late-game stocks stay inside the panel
  const delta = r => (forecast ? forecast.delta[r] : 0);
  const cellW = r => Math.max(res.length > 4 ? 40 : 50, 16 + textWidth(String(S[r]), "caps") + (delta(r) ? textWidth(signed(delta(r))) + 2 : 0));
  const pw = res.reduce((a, r) => a + cellW(r), 6);
  windowBox(4, 4, pw, 17);
  let x = 8;
  res.forEach(r => {
    const hop = ui.bump[r] > 0 ? 1 : 0, d = delta(r), w = cellW(r);
    spriteC("i_" + r, x + 5, 12 - hop);
    text(S[r], x + 12, 8 - hop, { font: "caps", colour: hop ? "#ffffff" : C.text });
    if (d) text(signed(d), x + 13 + textWidth(String(S[r]), "caps"), 8, { colour: d > 0 ? C.green : C.red });
    hudAnchor[r] = [x + 5, 12];
    hotspot(x - 2, 5, w, 15, "res:" + r, null, { tip: resTip(r) });
    x += w;
  });

  drawWeatherStrip();

  // population, free hands and day, top right
  const beds = totalBeds(), p = pop(), hands = forecast ? forecast.idle : 0;
  const s1 = `${p}`, s2 = `/${beds}`, dayS = `DAY ${S.day}`, s3 = String(hands);
  const handsW = textWidth(s3) + 10;
  const w = textWidth(s1, "caps") + textWidth(s2) + textWidth(dayS, "caps") + 34 + handsW + (forecast && forecast.arrive ? 10 : 0);
  const x0 = VW - 4 - w, hop = ui.bump.pop > 0 ? 1 : 0;
  windowBox(x0, 4, w, 17);
  icon("person", x0 + 6, 9 - hop, C.green);
  let tx = x0 + 12 + text(s1, x0 + 12, 8 - hop, { font: "caps", colour: hop ? "#ffffff" : C.text });
  tx += text(s2, tx, 8, { colour: p >= beds ? C.red : C.dim });
  if (forecast && forecast.arrive) tx += 2 + text("+" + forecast.arrive, tx + 2, 8, { colour: C.green });
  // free hands: villagers without a job, who build or sit by the fire
  const hx = tx + 6;
  icon("hand", hx, 8, hands ? C.sky : C.faint);
  text(s3, hx + 7, 8, { colour: hands ? C.text : C.faint });
  hotspot(hx - 2, 4, handsW, 17, "hands", null, { tip: handsTip() });
  hudAnchor.hands = [hx + 3, 11];
  text(dayS, x0 + w - 6, 8, { font: "caps", colour: C.gold, align: "right" });
  hudAnchor.pop = [x0 + 7, 11];
  hotspot(x0, 4, hx - 3 - x0, 17, "pop", null, { tip: popTip() });

  // the next milestone
  const m = nextMilestone(), gv = revealed("goal");
  if (m && gv > 0) {
    const label = m.festival ? "FESTIVAL" : unlockNames(m).join(" + "), at = `AT ${m.pop}`;
    const gw = Math.max(96, textWidth(at, "caps") + textWidth(label, "caps") + 20), gx = VW - 4 - gw, gy = 24 - Math.round((1 - gv) * 30);
    windowBox(gx, gy, gw, 26);
    text(at, gx + 6, gy + 4, { font: "caps", colour: C.dim });
    text(label, gx + gw - 6, gy + 4, { font: "caps", colour: C.gold, align: "right" });
    const prev = S.ms ? MILESTONES[S.ms - 1].pop : 0, k = Math.max(0, Math.min(1, (p - prev) / (m.pop - prev)));
    slotBox(gx + 5, gy + 14, gw - 10, 7);
    const fw = Math.round((gw - 14) * k);
    rect(gx + 7, gy + 16, fw, 3, C.green); rect(gx + 7, gy + 16, fw, 1, "#d4f7a8");
    hudAnchor.goal = [gx + gw / 2, gy + 17];
    hotspot(gx, gy, gw, 26, "goal", null, { tip: m.goal ? ["THIS ISLAND'S GOAL", `Reach *${m.pop} villagers*: ` + (m.festival ? "the voyage's *last festival*." : "then the *ship* can be built, to sail on.")]
      : ["NEXT MILESTONE", `Reach *${m.pop} villagers* to unlock ${m.festival ? "the *festival* (and the ship)" : "the *" + label.toLowerCase() + "*"}.`] });
  } else if (!m) {
    const ship = S.b.find(b => b.t === "ship");
    const done = W && W.voyage.done && !W.voyage.endless && S.chapter === W.settings.length;
    const s = done ? "VOYAGE COMPLETE" : lastChapter() ? "THE ISLAND THRIVES" : !ship ? "BUILD THE SHIP" : ship.site ? "BUILDING THE SHIP" : "THE SHIP IS READY";
    const gw = textWidth(s, "caps") + 12;
    const hv = hotspot(VW - 4 - gw, 24, gw, 14, "goal", done ? () => grandCard() : null, done ? { tip: ["VOYAGE COMPLETE", "The Grand Festival is held. *Click* to sail on, or to start a new world."] } : {});
    windowBox(VW - 4 - gw, 24, gw, 14);
    text(s, VW - 4 - gw / 2, 27, { font: "caps", colour: hv && done ? "#ffffff" : C.gold, align: "center" });
  }
  drawLetters(m && gv > 0 ? 52 : 40);
}

// letters from the settled islands: an envelope under the goal, a line per ask
function drawLetters(y) {
  const L = openLetters();
  if (!L.length || !forecast) return;
  const sent = new Set((forecast.letters || []).map(l => l.node)), w = 34, x = VW - 4 - w, hop = Math.floor(now * 2) % 2 && L.some(l => !sent.has(l.isl.node)) ? 1 : 0;
  hotspot(x, y, w, 14, "letters", null, { tip: ["LETTERS", ...L.map(l => `*${l.isl.name}* asks for *${l.n} ${l.res}* by day ${l.until}` + (sent.has(l.isl.node) ? ": its boat takes it *tonight*." : "."))
    , "A tribute boat from that island takes it home from the *harbour*, and trade with it grows: *bigger tribute*, and a double load sent back."] });
  windowBox(x, y, w, 14);
  icon("letter", x + 5, y + 5 - hop, C.coin);
  text(String(L.length), x + 16, y + 4, { font: "caps", colour: C.text });
  if (L.some(l => sent.has(l.isl.node))) icon("check", x + 24, y + 5, C.green);
  hudAnchor.letters = [x + 8, y + 7];
}

// ------------------------------------------------------------- the weather

// today and the next two days, under the resources: the season, and what comes
// (storm, rising sea, harvest, spring tide, serpent).  9x9 pixel pictures
const WX_ICON = {
  spring: [".........", "..p...p..", ".ppp.ppp.", "..pyp.p..", "...p.....", "...g..g..", "...g.g...", "....gg...", "....g...."],
  summer: ["....y....", ".y.....y.", "...yyy...", "..yyyyy..", "y.yyYyy.y", "..yyyyy..", "...yyy...", ".y.....y.", "....y...."],
  autumn: [".......o.", ".....ooo.", "...ooOoo.", "..ooOooo.", ".oOoooo..", ".Ooooo...", "..ooo....", ".O.......", "O........"],
  winter: ["....w....", ".w..w..w.", "..w.w.w..", "...www...", "wwwwwwwww", "...www...", "..w.w.w..", ".w..w..w.", "....w...."],
  storm: ["..DDD....", ".DdddDD..", "DdddddddD", ".DDDDDDD.", "....y....", "...yy....", "....yy...", ".....y...", "....y...."],
  rise: ["....b....", "...bbb...", "..b.b.b..", "....b....", "....b....", ".........", "b.bb.bb.b", ".bb.bb.bb", "bbbbbbbbb"],
  harvest: ["...G.G...", "..GGGGG..", "...GGG...", "...GoG...", "..G.G.G..", ".G..G..G.", "...GGG...", "...G.G...", "..G...G.."],
  tide: [".........", ".........", "..b...b..", ".b.b.b.b.", "b...b...b", ".........", "sssssssss", ".sssssss.", "........."],
  serpent: [".........", "..ee.....", ".eEee....", ".e..e..e.", "....e.ee.", ".b..eee..", "bbb.....b", ".bbb.bbb.", "........."],
  merchant: ["....L....", "...L.L...", "..LLLLL..", "..LyyyL..", "..LyYyL..", "..LyyyL..", "..LLLLL..", "...L.L...", "........."],
};
const WX_COL = { p: "#f7b0c0", y: "#ffd66b", Y: "#fff4c8", g: "#6ab04a", o: "#e0903a", O: "#b85a28", w: "#ffffff", d: "#9aa4bc", D: "#5a6478",
  b: "#86d0e0", s: "#e6d49a", G: "#e8c24e", e: "#6ab04a", E: "#ffffff", L: "#c8a050" };
function wxIcon(name, x, y) {
  WX_ICON[name].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") rect(x + i, y + j, 1, 1, WX_COL[row[i]]); });
}
const wxEvent = X => (X.storm ? "storm" : X.rise ? "rise" : X.harvest ? "harvest" : X.tide ? "tide" : X.serpent ? "serpent" : null);
function drawWeatherStrip() {
  const v = revealed("weather");
  if (v <= 0) return;
  const bw = 14, x0 = 4, y0 = 23 - Math.round((1 - v) * 30);
  windowBox(x0, y0, 3 * bw + 4, 27);
  forecastDays(3).forEach((X, k) => {
    const x = x0 + 2 + k * bw, y = y0 + 2, ev = wxEvent(X);
    slotBox(x, y, bw, 23);
    if (k === 0) rect(x + 2, y + 1, bw - 4, 1, C.gold);
    wxIcon(SEASONS[X.season], x + 3, y + 3);
    if (ev) wxIcon(ev, x + 3, y + 12);
    else if (merchantDue(S.day + k)) wxIcon("merchant", x + 3, y + 12);
    hotspot(x, y, bw, 23, "wx:" + k, null, { tip: wxTip(X, k) });
  });
  hudAnchor.weather = [x0 + 8, y0 + 12];
}
function wxTip(X, k) {
  const S0 = SEASONS[X.season], name = S0[0].toUpperCase() + S0.slice(1);
  const lines = [`*${name}*, day ${X.sday + 1} of ${X.len}.`];
  if (!X.rules) lines.push("Calm weather: the seasons change only the look.");
  else lines.push({ spring: `Trails form at *${SPRING_TRAIL}* wear.`, summer: "Fields on a meadow make *+1*.",
    autumn: `The *harvest* comes on day ${HARVEST.day + 1}: fields bring in *${HARVEST.times}x*.`,
    winter: "*Fields rest*: their hands are free to build. Fishers still fish." }[S0]);
  if (X.frozen) lines.push("The rivers are *frozen*: villagers walk across.");
  if (X.storm) lines.push("A *storm*: the shore floods (fields there make nothing), fishers stay ashore, and no boat comes in.");
  if (X.rise) lines.push("*The sea rises* tonight: the outer shore goes under. What stands there is refunded; cobbles and sea walls hold.");
  if (X.harvest) lines.push("*Harvest*: every field brings in " + HARVEST.times + "x.");
  if (X.tide) lines.push("*Spring tide*: the sandbars can be walked.");
  if (X.serpent) lines.push("A *sea serpent*: one boat turns back unless the *lighthouse* is lit.");
  if (merchantDue(S.day + k)) lines.push("The *night merchant*'s sail: it stops tonight if a *lit path* (lamps on cobbles) leads from the shore to a tavern." +
    (k === 0 && forecast && forecast.merchant ? (forecast.merchant.lit ? " The way is lit: *it will stop*." : " No lit way yet: a lamp lights 2 tiles round it.") : ""));
  return [["TODAY", "TOMORROW", "IN 2 DAYS"][k], ...lines];
}

function resTip(r) {
  const P = forecast;
  if (r === "wool") return ["WOOL", `Shepherds shear *${P.make.wool}* tomorrow. Workshops spin wool into goods before they use wood.`];
  if (r === "pearl") return ["PEARLS", `Divers bring up *${P.make.pearl}* tomorrow; markets sell *${P.use.pearl}* (one for every ${R.pearl.per} passers-by, *${R.pearl.price} coins* each).`];
  if (r === "food") return ["FOOD", `Fields and fishers make *${P.make.food}* tomorrow; *${P.eat}* villagers eat ${P.eat}.`,
    `Each newcomer needs *${R.arriveFood} spare food* to settle.`];
  if (r === "wood") return ["WOOD", `Woodcutters make *${P.make.wood}* tomorrow. Almost everything is built from wood.`];
  if (r === "stone") return ["STONE", `Quarries cut *${P.make.stone}* tomorrow. Stone *paves* ground at once.`];
  if (r === "clay") return ["CLAY", `Clay pits dig *${P.make.clay}* tomorrow. Workshops turn clay into goods before wood.`];
  if (r === "goods") return ["GOODS", `Workshops make *${P.make.goods}* tomorrow; houses use *${P.use.goods}* tonight.`,
    `A house uses *${R.goods.perResident}* for each resident a night, bought on the way past a market.`];
  return ["COINS", `Markets, taverns and stalls earn *${P.make.coin}* tomorrow, from the villagers who walk past.`];
}
function handsTip() {
  const F = forecast, crew = Object.keys(F.crew).length;
  const lines = [`*${F.idle}* free hand${F.idle === 1 ? "" : "s"}: villagers without a job. They build, or sit at the hearth.`];
  if (crew) lines.push(`*${crew}* of them build tomorrow.`);
  else if (S.b.some(b => b.site)) lines.push("A building site waits for free hands.");
  if (F.word) lines.push("Nearly everyone works: *word spreads*, one more newcomer tonight.");
  if (F.weather.winter && S.b.some(b => b.t === "field")) lines.push("Fields rest in winter: their hands are free to build.");
  return ["FREE HANDS", ...lines];
}
function popTip() {
  const beds = totalBeds(), p = pop();
  const lines = [`*${p}* villagers, *${beds}* beds.`];
  if (p >= beds) lines.push("Every bed is taken: build a *cottage* so newcomers can move in.");
  else if (forecast.arrive) lines.push(`*${forecast.arrive}* newcomer${forecast.arrive > 1 ? "s" : ""} will arrive tonight.`);
  else lines.push(`Newcomers need *${R.arriveFood} spare food* after supper.`);
  if (S.b.some(b => b.t === "house" && forecast.needs[b.id] && !forecast.needs[b.id].met)) lines.push("Some houses keep their extra beds closed: see what they *want*.");
  if (W && W.islands.length) lines.push(`The realm: *${realmPop()}*, with ${W.islands.map(i => `${i.name} ${i.peak}`).join(", ")}.`);
  return ["VILLAGERS", ...lines];
}

// --------------------------------------------------------------- build bar

// the cards: a category with two or more buildings unlocked is one card (it opens
// a row of them); a category with one shows that building; then the axe
const members = g => BUILDINGS.filter(b => b.group === g && unlocked(b)).map(b => b.id);
const TOOLS = () => {
  const ids = [];
  for (const g in GROUPS) {
    const m = GROUPS[g] ? members(g) : unlocked(BD[g]) ? [g] : [];
    if (m.length) ids.push(m.length > 1 ? g : m[0]);
  }
  return [...ids, "clear"];
};
const groupOf = id => (BD[id] && BD[id].group) || null;
// the card a building is on right now: its own, or its category's
const cardOf = id => (groupOf(id) && TOOLS().includes(groupOf(id)) ? groupOf(id) : id);
function barLayout() {
  const tools = TOOLS(), nm = nextMilestone(), next = nm && nm.unlock.length ? BD[nm.unlock[0]] : null;
  const n = tools.length + (next ? 1 : 0), gap = 2, endW = 64;
  // cards shrink a little on narrow screens; END DAY moves above the bar when
  // the two no longer fit side by side
  const cw = Math.max(20, Math.min(26, Math.floor((VW - 8 + gap) / n) - gap));
  const w = n * (cw + gap) - gap, y = VH - 36;
  const side = w + endW + 12 <= VW;
  const x = side ? Math.max(4, Math.round((VW - w - endW - 8) / 2)) : Math.max(4, Math.round((VW - w) / 2));
  return { tools, next, x, y, cw, ch: 32, gap, endX: VW - endW - 4, endY: side ? y : y - 36, endW, side };
}

function drawBar() {
  const L = barLayout();
  L.tools.forEach((id, i) => drawCard(id, L.x + i * (L.cw + L.gap), L.y, L.cw, L.ch, i));
  if (L.next) {
    const x = L.x + L.tools.length * (L.cw + L.gap), m = MILESTONES.find(mm => mm.unlock.includes(L.next.id));
    slotBox(x, L.y, L.cw, L.ch);
    const name = L.next.deco ? GROUPS.street.icon : "c_" + (L.next.id === "grove" ? "tree" : L.next.id);
    if (ATLAS.sprites[name]) { const [iw, ih] = spriteSize(name); silhouette(name, x + L.cw / 2 - iw / 2, L.y + 12 - ih / 2, "#3a4466"); }
    text("?", x + L.cw / 2, L.y + 8, { font: "caps", colour: C.faint, align: "center" });
    text(m ? String(m.pop) : "", x + L.cw / 2, L.y + L.ch - 9, { colour: C.faint, align: "center" });
    hotspot(x, L.y, L.cw, L.ch, "card:next", null, { tip: ["LOCKED", `Unlocks at *${m ? m.pop : "?"} villagers*.`] });
  }
  drawEndDay(L);
  drawSleep(L);
  drawSail(L);
  drawShopButton(L);
}
// MERCHANT: while the night merchant's stall is open, above SAIL (or SLEEP)
function drawShopButton(L) {
  if (!S.shop || S.shop.day !== S.day || day.on) return;
  const x = L.endX, y = L.endY - (W && shipReady() ? 45 : 30), w = L.endW;
  const hv = hotspot(x, y, w, 13, "shop", openShop, { tip: ["THE NIGHT MERCHANT", "Its cart stands by the tavern until tonight: food, wood and goods, an heirloom, a boon and more, for coins."] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: pressed("shop", hv), accent: C.gold });
  const d = pressed("shop", hv) ? 1 : 0;
  icon("lantern", x + 5, y + 4 + d, C.gold);
  text("WARES", x + w / 2 + 4, y + 3 + d, { font: "caps", colour: C.gold, align: "center" });
}
// SAIL: once the ship is built, the chart opens to choose the next island
function drawSail(L) {
  if (!W || !shipReady() || day.on) return;
  const x = L.endX, y = L.endY - 30, w = L.endW;
  const hv = hotspot(x, y, w, 13, "sail", () => openChart("depart"), { tip: ["SAIL", "The ship is ready. Choose the next island on the chart; this one stays behind, settled, and sends tribute."] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: pressed("sail", hv), accent: C.gold });
  const d = pressed("sail", hv) ? 1 : 0;
  icon("boat", x + 5, y + 4 + d, C.gold);
  text("SAIL", x + w / 2 + 4, y + 3 + d, { font: "caps", colour: C.gold, align: "center" });
}

// a group card opens a row of its buildings above it
function drawFlyout(L) {
  const i = L.tools.indexOf(ui.flyout);
  if (i < 0 || day.on) { ui.flyout = null; return; }
  const items = members(ui.flyout);
  const w = items.length * (L.cw + L.gap) - L.gap + 6, cx = L.x + i * (L.cw + L.gap) + L.cw / 2;
  // left of END DAY and SLEEP, wherever they sit
  const right = L.endX - 4;
  // and clear of the corner buttons down the left edge
  const x = Math.round(Math.max(22, Math.min(right - w, cx - w / 2))), y = L.y - L.ch - 9;
  hotspot(x, y, w, L.ch + 6, "flyout", null);
  windowBox(x, y, w, L.ch + 6);
  items.forEach((id, k) => drawCard(id, x + 3 + k * (L.cw + L.gap), y + 3, L.cw, L.ch, -1));
}

function drawCard(id, x, y, w, h, i) {
  if (GROUPS[id]) return drawGroupCard(id, x, y, w, h, i);
  const def = BD[id], on = ui.tool === id, hid = "card:" + id;
  // a one-per-island building that already stands: shown as done, not for sale
  if (def && def.unique && count(id)) {
    hotspot(x, y, w, h, hid, () => sfx.nope(), { tip: [def.name.toUpperCase(), "Already stands on the island. Only one allowed."] });
    bevel(x, y, w, h, C.winLo, C.win, C.winLo);
    const name = "c_" + id;
    if (ATLAS.sprites[name]) { const [iw, ih] = spriteSize(name); silhouette(name, x + w / 2 - iw / 2, y + 12 - ih / 2, "#4a5478"); }
    icon("check", x + w / 2 - 3, y + h - 9, C.green);
    return;
  }
  const afford = id === "clear" || canAfford(def);
  const tip = id === "clear"
    ? ["CLEAR", "Fell a tree (*+1 wood*) or pull down a building (half its wood back). Key: " + (i + 1)]
    : [def.name.toUpperCase(), def.desc, costLine(def) + (def.labour ? `, *${def.labour}* builder-day${def.labour > 1 ? "s" : ""}` : "") + (i >= 0 ? `   key ${i + 1}` : "")];
  const hov = hotspot(x, y, w, h, hid, () => selectTool(id), { tip });
  if (on) bevel(x, y, w, h, C.btnLo, C.slotLo, C.btn);
  else if (afford) buttonBox(x, y, w, h, { hover: hov, pressed: pressed(hid, hov) });
  else bevel(x, y, w, h, C.winLo, C.win, C.winLo);
  const d = on || pressed(hid, hov) ? 1 : 0;
  if (id === "clear") icon("axe", x + w / 2 - 2 + d, y + 8 + d, afford ? C.text : C.faint);
  else {
    const name = "c_" + (id === "grove" ? "tree" : id);
    if (ATLAS.sprites[name]) {
      if (afford) spriteC(name, x + w / 2 + d, y + 12 + d);
      else { const [iw, ih] = spriteSize(name); silhouette(name, x + w / 2 - iw / 2, y + 12 - ih / 2, "#4a5478"); }
    } else if (DRAWN_ICON[id]) DRAWN_ICON[id](x + w / 2 + d, y + 12 + d, afford);
    // cost: wood in wood colour, coins in gold
    const cost = costOf(def), parts = RES.filter(r => cost[r]).map(r => [String(cost[r]), r]);
    const cw = parts.reduce((a, [s]) => a + textWidth(s) + 3, -3);
    let cx = Math.round(x + w / 2 - cw / 2);
    for (const [s, r] of parts) cx += text(s, cx, y + h - 9, { colour: (S[r] || 0) >= cost[r] ? C[r] : C.red }) + 3;
  }
  if (on) { rect(x + 2, y + 1, w - 4, 1, C.gold); rect(x + 2, y + h - 2, w - 4, 1, C.gold); }
}
function drawGroupCard(id, x, y, w, h, i) {
  const g = GROUPS[id], hid = "card:" + id, held = groupOf(ui.tool) === id, on = ui.flyout === id || held;
  const names = members(id).map(m => BD[m].name).join(", ");
  const hov = hotspot(x, y, w, h, hid, () => { ui.flyout = ui.flyout === id ? null : id; sfx.click(); },
    { tip: [g.name.toUpperCase(), g.desc, names + `   key ${i + 1}`] });
  const any = members(id).some(m => canAfford(BD[m]));
  if (on) bevel(x, y, w, h, C.btnLo, C.slotLo, C.btn);
  else if (any) buttonBox(x, y, w, h, { hover: hov, pressed: pressed(hid, hov) });
  else bevel(x, y, w, h, C.winLo, C.win, C.winLo);
  const d = on || pressed(hid, hov) ? 1 : 0;
  // the building picked from it, or the category's own picture
  if (held && DRAWN_ICON[ui.tool]) DRAWN_ICON[ui.tool](x + w / 2 + d, y + 12 + d, true);
  else spriteC(held ? "c_" + (ui.tool === "grove" ? "tree" : ui.tool) : ATLAS.sprites["c_cat_" + id] ? "c_cat_" + id : g.icon, x + w / 2 + d, y + 12 + d);
  // three dots: more inside
  for (let k = 0; k < 3; k++) rect(x + w / 2 - 4 + k * 3 + d, y + h - 7 + d, 2, 2, ui.flyout === id ? C.gold : C.dim);
  if (on) { rect(x + 2, y + 1, w - 4, 1, C.gold); rect(x + 2, y + h - 2, w - 4, 1, C.gold); }
}
function costLine(def) {
  const c = costOf(def);
  return RES.filter(r => c[r]).map(r => `*${c[r]} ${r}*`).join(" + ");
}
// fields and bridges are painted into the ground, so their cards get small drawn icons
function drawFieldIcon(cx, cy, on) {
  for (let j = 0; j < 8; j++) for (let i = 0; i < 14; i++) {
    const x = cx - 7 + i, y = cy - 4 + j;
    rect(x, y, 1, 1, !on ? "#4a5478" : j % 2 ? "#9a6a3c" : (i + j) % 5 ? "#e8c24e" : "#f6de84");
  }
}
function drawBoardwalkIcon(cx, cy, on) {
  rect(cx - 8, cy - 3, 16, 7, on ? "#6f8a4a" : "#4a5478");
  for (let i = 0; i < 16; i += 3) rect(cx - 8 + i, cy - 2, 2, 5, on ? "#c49460" : "#3a4466");
}
function drawPaveIcon(cx, cy, on) {
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) rect(cx - 8 + i * 4 + (j % 2) * 2, cy - 4 + j * 3, 3, 2, on ? (i + j) % 2 ? "#c9c1b2" : "#a8a090" : "#4a5478");
}
function drawBridgeIcon(cx, cy, on) {
  rect(cx - 8, cy - 2, 16, 6, on ? "#5ab0cf" : "#4a5478");
  for (let i = 0; i < 16; i += 2) rect(cx - 8 + i, cy - 4, 1, 7, on ? "#c49460" : "#3a4466");
  rect(cx - 8, cy - 4, 16, 1, on ? "#8e6238" : "#3a4466"); rect(cx - 8, cy + 2, 16, 1, on ? "#8e6238" : "#3a4466");
}
function drawCausewayIcon(cx, cy, on) {
  rect(cx - 8, cy - 3, 16, 7, on ? "#e6d49a" : "#4a5478");
  rect(cx - 8, cy + 2, 16, 2, on ? "#78c7cf" : "#3a4466");
  for (let i = 0; i < 16; i += 3) rect(cx - 8 + i, cy - 2, 2, 4, on ? "#c49460" : "#3a4466");
}
function drawSeawallIcon(cx, cy, on) {
  rect(cx - 8, cy + 1, 16, 3, on ? "#5ab0cf" : "#4a5478");
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) rect(cx - 8 + i * 4 + (j % 2) * 2, cy - 4 + j * 3, 3, 2, on ? (i + j) % 2 ? "#bcb6aa" : "#9a948a" : "#3a4466");
}
function drawReclaimIcon(cx, cy, on) {
  rect(cx - 8, cy - 1, 16, 5, on ? "#4a9fc0" : "#3a4466");
  for (let i = 0; i < 9; i++) rect(cx - 8 + i, cy - 4 + Math.floor(i / 3), 1, 5 - Math.floor(i / 3), on ? "#8cc063" : "#4a5478");
  rect(cx + 1, cy - 2, 1, 5, on ? "#c49460" : "#3a4466"); rect(cx - 8, cy + 3, 16, 1, on ? "#86d0e0" : "#3a4466");
}
function drawLongBridgeIcon(cx, cy, on) {
  rect(cx - 8, cy - 2, 16, 6, on ? "#78c7cf" : "#4a5478");
  for (let i = 0; i < 16; i += 2) rect(cx - 8 + i, cy - 4, 1, 7, on ? "#c49460" : "#3a4466");
  rect(cx - 8, cy - 4, 16, 1, on ? "#8e6238" : "#3a4466"); rect(cx - 8, cy + 2, 16, 1, on ? "#8e6238" : "#3a4466");
  rect(cx - 6, cy + 3, 1, 2, on ? "#6e4024" : "#3a4466"); rect(cx + 5, cy + 3, 1, 2, on ? "#6e4024" : "#3a4466");
}
// the cards whose buildings are painted into the ground get small drawn icons
const DRAWN_ICON = { field: drawFieldIcon, bridge: drawBridgeIcon, boardwalk: drawBoardwalkIcon, pave: drawPaveIcon,
  causeway: drawCausewayIcon, seawall: drawSeawallIcon, reclaim: drawReclaimIcon, longbridge: drawLongBridgeIcon };

function selectTool(id) {
  if (day.on) return;
  if (BD[id] && BD[id].unique && count(id)) return sfx.nope();
  if (GROUPS[id]) { ui.flyout = ui.flyout === id ? null : id; return sfx.click(); }
  ui.tool = ui.tool === id ? null : id;
  ui.flyout = null; // picked: the row closes, the category card shows what is held
  ui.tapTile = null; ui.preview = null;
  sfx.click();
}

function drawEndDay(L) {
  const x = L.endX, y = L.endY, w = L.endW, h = L.ch;
  const hov = hotspot(x, y, w, h, "endday", startDay, { tip: day.on
    ? ["FAST FORWARD", "Plays the rest of the day quickly."]
    : ["END DAY", "Your villagers walk to work, make what they make, and come home along the paths they wear. Key: Space"] });
  buttonBox(x, y, w, h, { hover: hov, pressed: pressed("endday", hov), accent: C.gold });
  const d = pressed("endday", hov) ? 1 : 0;
  if (day.on) {
    icon("fast", x + w / 2 - 3, y + 9 + d, C.gold);
    text(day.stage.toUpperCase(), x + w / 2, y + 19 + d, { colour: C.dim, align: "center" });
  } else {
    text("END DAY", x + w / 2, y + 7 + d, { font: "caps", colour: C.gold, align: "center" });
    // a small sun that sets when you hover
    const sy = y + 20 + d + (hov ? 1 : 0);
    rect(x + w / 2 - 3, sy, 7, 3, C.gold); rect(x + w / 2 - 2, sy - 1, 5, 1, C.gold);
    rect(x + w / 2 - 8, sy + 3, 17, 1, C.goldLo);
  }
}

// SLEEP: days play quickly, one after another, until something happens
function drawSleep(L) {
  if (S.day < 2) return;
  const x = L.endX, y = L.endY - 15, w = L.endW, on = ui.sleep;
  const hv = hotspot(x, y, w, 13, "sleep", toggleSleep, { tip: on ? ["WAKE UP", "Stop sleeping after this day."]
    : ["SLEEP", "Days pass quickly until something happens: a newcomer, a milestone, a building finished, or something new you can afford. Key: Z"] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: on || pressed("sleep", hv) });
  const d = on || pressed("sleep", hv) ? 1 : 0;
  icon("moon", x + 6, y + 4 + d, on ? C.gold : C.dim);
  text(on ? "WAKE" : "SLEEP", x + w / 2 + 3, y + 3 + d, { font: "caps", colour: on ? C.gold : C.text, align: "center" });
}
function toggleSleep() {
  if (ui.sleep) { ui.sleep = false; return sfx.click(); }
  if (ui.modal || ui.codex) return;
  ui.sleep = true; ui.tool = null; ui.flyout = null;
  sleepState.days = 0; sleepState.afford = affordable();
  if (!day.on) startDay();
  sfx.click();
}
const sleepState = { days: 0, afford: [] };
const affordable = () => BUILDINGS.filter(b => unlocked(b) && !(b.unique && count(b.id)) && canAfford(b)).map(b => b.id);
// why a night of sleep ends, or null to sleep on
function wakeReason(passed, P) {
  if (passed.length) return "A MILESTONE";
  if (day.arrived && day.arrived.length) return "A NEWCOMER";
  if (P.finish.length) return "BUILT";
  if (P.hungry) return "HUNGRY";
  // moments: an event begins or is found, a secret, the merchant's stall
  if (moments.found.length) return "A SECRET";
  if (moments.reached) return "FOUND";
  if (moments.started) return { stranger: "FOOTPRINTS", herd: "A HERD", wreck: "A WRECK", treasure: "PIRATES!" }[moments.started.id];
  if (moments.letters.length) return "A LETTER";
  if (S.shop && S.shop.day === S.day) return "THE NIGHT MERCHANT";
  // the weather: a storm showing up in the strip, winter, a spring tide, the sea about to rise
  const X = wx(), ahead = weatherOf(S.day + 2);
  if (X.rise) return "THE SEA RISES TONIGHT";
  if (ahead.storm) return "A STORM IS COMING";
  if (X.snow && X.sday === 0) return "WINTER";
  if (X.tide && !weatherOf(S.day - 1).tide) return "SPRING TIDE";
  const now = affordable(), fresh = now.find(id => !sleepState.afford.includes(id));
  sleepState.afford = now;
  if (fresh) return "ENOUGH FOR A " + BD[fresh].name.toUpperCase();
  if (++sleepState.days >= 30) return "A MONTH HAS PASSED";
  return null;
}

// what houses want, over their roofs; building sites show how far along they are
function drawWants() {
  if (day.on || !forecast || ui.title || pathView()) return;
  for (const b of S.b) {
    const [sx, sy] = tileTop(b.x, b.y), top = sy + (BASE[bSprite(b)] || 14) - spriteSize(bSprite(b))[1];
    if (b.site) {
      const whole = BD[b.to || b.t].labour, w = 14, done = Math.round(w * (whole - b.site) / whole);
      rect(sx - w / 2 - 1, top - 5, w + 2, 4, C.ink); rect(sx - w / 2, top - 4, w, 2, C.winLo); rect(sx - w / 2, top - 4, done, 2, C.gold);
      continue;
    }
    const nd = b.t === "house" && forecast.needs[b.id];
    if (!nd || nd.met) continue;
    const ic = !nd.market ? "shop" : !nd.goods ? "crate" : "mug", bob = Math.floor(now * 2 + b.id) % 2;
    bevel(sx - 5, top - 11 - bob, 11, 10, "#10142a", C.winHi, C.ink);
    icon(ic, sx - 2, top - 9 - bob, !nd.market ? C.red : !nd.goods ? C.goods : C.sky);
  }
}

// the small buttons, in a column down the left edge under the weather strip (a second
// column when the screen is short): help, chart, statistics, paths, speed, sound, menu
const cornerTop = () => 54;
function cornerSlot(i) {
  const per = Math.max(3, Math.floor((VH - 40 - cornerTop()) / 14));
  return [4 + Math.floor(i / per) * 16, cornerTop() + (i % per) * 14];
}
function drawCorner() {
  const btn = (i, id, ic, col, fn, tip) => {
    const [x, y] = cornerSlot(i), hv = hotspot(x, y, 14, 12, id, fn, { tip });
    buttonBox(x, y, 14, 12, { hover: hv, pressed: pressed(id, hv) });
    const d = pressed(id, hv) ? 1 : 0;
    icon(ic, x + 7 - Math.ceil(ICONS[ic][0].length / 2), y + 6 - Math.ceil(ICONS[ic].length / 2) + d, col);
    return [x, y];
  };
  const [hx, hy] = btn(0, "help", "help", C.sky, () => openCodex(), ["HOW TO PLAY", "Every rule, in pages you can reread. Key: H"]);
  if (codexUnread() && Math.floor(now * 2) % 2) rect(hx + 10, hy + 1, 2, 2, C.gold);
  btn(1, "chart", "compass", C.sky, () => openChart("view"), ["SEA CHART", "Every island of this voyage, and the ones on offer. Key: M"]);
  btn(2, "stats", "bars", C.green, () => openStats(), ["CHRONICLE", "The island's story in numbers: villagers, stock and paths over the days, and everything that happened. Key: C"]);
  btn(3, "paths", "feet", ui.paths ? C.gold : C.faint, togglePaths, ["PATH VIEW", (ui.paths ? "Trees and buildings lie flat" : "Lay trees and buildings flat") + ", so every path shows. Key: P"]);
  btn(4, "fast", "fast", ui.fast ? C.gold : C.faint, () => (ui.fast = !ui.fast), ["DAY SPEED", ui.fast ? "Days play at double speed." : "Days play at normal speed."]);
  btn(5, "mute", PROFILE.muted ? "mute" : "note", PROFILE.muted ? C.faint : C.sky, toggleMute, ["SOUND", PROFILE.muted ? "Sound is off." : "Sound is on."]);
  btn(6, "menu", "menu", C.dim, openTitle, ["MENU", "Back to the title: carry on, a new world, or your other worlds."]);
}
function togglePaths() { ui.paths = !ui.paths; sfx.click(); }

// ------------------------------------------------------- map interaction

function hoverTile() {
  if (ui.mouse.touch) return ui.tapTile;
  if (!ui.mouse.in || hitHot(ui.mouse.x, ui.mouse.y)) return null;
  const [x, y] = screenToTile(ui.mouse.wx, ui.mouse.wy);
  return inMap(x, y) ? [x, y] : null;
}

// the building whose sprite is under the pointer (front-most first), else the tile's
function buildingUnder(mx, my) {
  const hits = S.b.filter(b => {
    if (b.t === "field" || pathView()) return false;
    const [sx, sy] = tileTop(b.x, b.y), name = bSprite(b), [w, h] = spriteSize(name), base = sy + (BASE[name] || 14);
    return mx >= sx - w / 2 && mx < sx + w / 2 && my >= base - h && my < base;
  }).sort((a, b) => (b.x + b.y) - (a.x + a.y));
  if (hits.length) return hits[0];
  const [x, y] = screenToTile(mx, my);
  return inMap(x, y) ? bAt(x, y) : null;
}

// under the objects: the placement cursor and the overlays that explain it
function drawGroundOverlay() {
  if (ui.title) return;
  drawMomentGround();
  const tile = hoverTile(), tool = ui.tool;
  if (tool && !day.on) {
    const def = BD[tool];
    // where this can go at all, for the picky ones
    if (def && (def.place === "coast" || def.place === "water" || def.place === "sea" || def.place === "strait")) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (placeProblem(def, x, y)) continue;
        const [sx, sy] = tileTop(x, y);
        drawTile(sx, sy, "#ffffff", Math.floor(now * 2) % 2 ? "3" : "2");
      }
    }
    if (tool === "market" || tool === "stall") drawFootfall();
    if (tile) drawPlacement(tool, tile[0], tile[1]);
  } else if (!day.on) {
    const b = inspectedBuilding();
    if (b) {
      drawTile(...tileTop(b.x, b.y), C.gold, "edge");
      reachOf(b.t, b.x, b.y);
    }
  }
}
// the building the pointer is on (or the last one tapped), when no card is held
function inspectedBuilding() {
  if (ui.title || ui.tool || day.on) return null;
  return ui.mouse.in && !ui.mouse.touch && !hitHot(ui.mouse.x, ui.mouse.y) ? buildingUnder(ui.mouse.wx, ui.mouse.wy) : ui.inspectedB;
}
// the area a woodcutter or well works over
function reachOf(t, x, y) {
  if (t === "woodcutter") ringTiles(x, y, R.cutterRadius, (i, j) => isTree(i, j), C.gold);
  if (t === "well") ringTiles(x, y, R.wellRadius, (i, j) => { const o = bAt(i, j); return o && isHome(o); }, C.sky);
  if (t === "fisher") stretchTiles(x, y);
  if (t === "market") ringTiles(x, y, R.marketReach, () => false, C.gold);
  if (t === "lodge") ringTiles(x, y, 2, (i, j) => { const o = bAt(i, j); return o && isHome(o); }, C.sky);
  if (t === "pier") ringTiles(x, y, 2, (i, j) => ground(i, j) === "_", C.gold);
  if (t === "shepherd") ringTiles(x, y, 2, (i, j) => { const k = idx(i, j); return S.ground[k] === "." && S.feat[k] === "." && !bAt(i, j) && S.cob[k] !== "1"; }, C.green);
}
// the stretch of coast a fisher would share
function stretchTiles(x, y) {
  const st = stretchOf(x, y);
  if (st < 0) return;
  const pulse = Math.floor(now * 2.5) % 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (stretchOf(i, j) !== st) continue;
    const [sx, sy] = tileTop(i, j), f = bAt(i, j);
    drawTile(sx, sy, f && f.t === "fisher" ? C.gold : C.sky, f && f.t === "fisher" ? "6" : "3");
    drawTile(sx, sy, pulse ? C.sky : "#ffffff", "edge");
  }
}

// drawn after the trees and buildings, so nothing hides it: the hovered
// building's routes, and markers on the trees a woodcutter would use
function drawOverObjects() {
  drawWants();
  drawMoments();
  if (ui.title || day.on) return;
  const b = inspectedBuilding();
  if (b) drawCommute(b);
  const tile = hoverTile();
  if (ui.tool === "woodcutter" && tile && !placeProblem(BD.woodcutter, ...tile)) treeMarks(...tile);
  else if (b && b.t === "woodcutter") treeMarks(b.x, b.y);
}
// the moments while planning: a bubble over the spot an event waits at, today's herd
// and its way across, the lit way the merchant would take
function drawMoments() {
  if (day.on || !forecast || ui.title || pathView() || visiting) return;
  const E = S.ev && S.ev.cur, bob = Math.floor(now * 2) % 2;
  const bubble = (i, draw) => { const [sx, sy] = tileTop(i % N, (i / N) | 0), y = sy - 24 - bob; bevel(sx - 6, y, 13, 11, "#10142a", C.winHi, C.ink); draw(sx, y); };
  if (forecast.merchant && forecast.merchant.lit) dotRoute(forecast.merchant.path, C.gold);
  for (const h of forecast.herds) bubble(h.route ? h.route[0] : h.from, (sx, y) => { drawDeer(sx, y + 9, 0, false); if (!h.route) text("x", sx + 4, y + 1, { colour: C.red }); });
  if (E && E.id === "treasure") { const g = treasureRing(E); bubble(idx(g.x, g.y), (sx, y) => icon("chest", sx - 3, y + 3, C.gold)); }
  else if (E && E.at !== undefined && E.id !== "herd") bubble(E.at, (sx, y) => E.id === "stranger" ? icon("feet", sx - 2, y + 3, C.gold) : text("?", sx + 1, y + 2, { font: "caps", colour: C.gold, align: "center" }));
}
// the moments on the ground, under everything that stands: the herd's hoofprints along
// its way, the stranger's footprints walking up from the shore (and the tiles where a
// walk finds them), the ring on the pirates' map
function drawMomentGround() {
  if (day.on || !forecast || pathView() || visiting) return;
  const E = S.ev && S.ev.cur;
  for (const h of forecast.herds) if (h.route) h.route.forEach((i, k) => {
    if (k % 2 || (k / 2 + Math.floor(now * 3)) % 6 === 0) return;
    const [sx, sy] = tileMid(i % N, (i / N) | 0);
    ctx.globalAlpha = 0.55;
    rect(sx - 3, sy - 1, 1, 2, "#5a3a20"); rect(sx - 1, sy - 1, 1, 2, "#5a3a20"); rect(sx + 2, sy + 1, 1, 2, "#5a3a20"); rect(sx + 4, sy + 1, 1, 2, "#5a3a20");
    ctx.globalAlpha = 1;
  });
  if (E && E.id === "stranger" && E.trail) {
    // prints appear one pair at a time from the shore up to the spot, then fade and start again
    const n = E.trail.length, walk = (now * 2.5) % (n + 6);
    E.trail.forEach((i, k) => {
      if (k > walk) return;
      const [sx, sy] = tileMid(i % N, (i / N) | 0), fade = Math.max(0.25, 1 - (walk - k) / (n + 6));
      ctx.globalAlpha = fade;
      rect(sx - 3, sy - 2, 2, 1, "#4a3020"); rect(sx - 3, sy - 1, 1, 1, "#4a3020"); rect(sx + 2, sy + 1, 2, 1, "#4a3020"); rect(sx + 3, sy + 2, 1, 1, "#4a3020");
    });
    ctx.globalAlpha = 1;
    const ex = E.at % N, ey = (E.at / N) | 0, pulse = Math.floor(now * 2) % 2;
    for (const [dx, dy] of [[0, 0], ...RING]) if (inMap(ex + dx, ey + dy) && (dx || dy)) { const [sx, sy] = tileTop(ex + dx, ey + dy); drawTile(sx, sy, C.gold, pulse ? "3" : "2"); }
  }
  if (E && E.id === "treasure") {
    const g = treasureRing(E), pulse = Math.floor(now * 2) % 2;
    for (let j = -g.r; j <= g.r; j++) for (let i = -g.r; i <= g.r; i++) {
      if (!inMap(g.x + i, g.y + j)) continue;
      const [sx, sy] = tileTop(g.x + i, g.y + j), sides = [j === -g.r && "NE", i === g.r && "SE", j === g.r && "SW", i === -g.r && "NW"].filter(Boolean);
      drawTile(sx, sy, "#e8604a", pulse ? "3" : "2");
      if (sides.length) drawTile(sx, sy, "#e8604a", "side:" + sides);
    }
    if (!g.r) { const [sx, sy] = tileMid(g.x, g.y); for (let k = -3; k <= 3; k++) { rect(sx + k, sy + k / 2, 1, 1, "#c83a2a"); rect(sx + k, sy - k / 2, 1, 1, "#c83a2a"); } }
  }
}
// what a tile holds from the moments, for the tooltip
function momentTip(x, y) {
  const i = idx(x, y), E = S.ev && S.ev.cur, cart = merchantCart();
  if (cart && cart[0] === x && cart[1] === y) return ["THE NIGHT MERCHANT", "Its cart stands by the tavern until tonight. *Click* it to see the wares."];
  if (E && E.at === i && E.id === "wreck") return ["A WRECK", "Wreckage on a sandbar: driftwood, and someone clinging on. A *walk within 1 tile* finds it; the sandbars are dry at a *spring tide*.", `The tide takes it in *${E.until - S.day + 1}* days.`];
  if (E && E.id === "treasure") {
    const g = treasureRing(E);
    if (Math.max(Math.abs(x - g.x), Math.abs(y - g.y)) <= g.r) return ["THE PIRATES' TREASURE", g.r ? `Somewhere in the red ring on the pirates' map a chest is buried. A villager who *walks over its very tile* digs it up (so does a building put on it). The ring closes in every ${TREASURE.shrink} days.` : "The chest lies *right here*: a walk over this tile digs it up.", `The pirates come back for it in *${E.until - S.day + 1}* days.`];
  }
  if (E && E.id === "stranger" && E.at !== i && Math.max(Math.abs(x - E.at % N), Math.abs(y - ((E.at / N) | 0))) <= 1)
    return ["FOUND FROM HERE", "A villager whose walk to work (or home) crosses one of the glowing tiles finds what waits at the end of the footprints. Put a workplace or a home so the way passes here."];
  if (E && E.at === i) return ["A STRANGER'S FOOTPRINTS", "Footprints lead here from the shore. A walk over the *glowing tiles* round it finds what waits: put work beyond it, or homes so the way passes by.", `Gone in *${E.until - S.day + 1}* days.`];
  const f = feat(x, y);
  if (PROPS[f]) return [PROPS[f].name.toUpperCase(), { H: "The hermit lives here: they gave the voyage a boon.", S: "An old shrine by the woods. Its page is in the codex, under SECRETS.",
    B: "The castaways' boat, pulled up for good: they live in the village now.", X: "Wreckage on the sandbar." }[f]];
  if (forecast) for (const h of forecast.herds) if ((h.route ? h.route[0] : h.from) === i)
    return ["MIGRATING HERD", h.route ? "A herd crosses the island today and tramples a trail on its way. *Trees* in its way turn it." : "Trees stand in the herd's way: it turns back to the sea."];
  return null;
}

function treeMarks(x, y) {
  const r = R.cutterRadius;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (!inMap(x + i, y + j) || !isTree(x + i, y + j)) continue;
    const [sx, sy] = tileTop(x + i, y + j), my = sy - 16 + (Math.floor(now * 3 + i + j) % 2);
    rect(sx - 2, my - 1, 5, 5, C.ink); rect(sx - 1, my, 3, 3, C.gold); rect(sx - 1, my, 1, 1, "#fff4c8");
  }
}

// footfall from the last day: denser dots where more feet passed
function drawFootfall() {
  for (let i = 0; i < N * N; i++) {
    const f = S.foot[i];
    if (!f) continue;
    const [sx, sy] = tileTop(i % N, (i / N) | 0);
    drawTile(sx, sy, C.gold, String(Math.min(12, 2 + f * 2)));
  }
}

// the routes a workplace's worker (or a home's residents) walk, with a ring
// on the far end of each
function drawCommute(b) {
  if (!forecast) return;
  const walks = forecast.walks.filter(w => w.job === b.id || bById(w.job) && S.vil.find(v => v.id === w.v && v.home === b.id));
  for (const w of walks) {
    const tired = tiredBy(w.commute), colour = tired === 2 ? C.red : tired ? "#ffb070" : "#ffffff";
    dotRoute(w.am, colour);
    const far = w.job === b.id ? w.am[0] : w.am[w.am.length - 1], [fx, fy] = tileMid(far % N, (far / N) | 0);
    ring(fx, fy + 1, 7, C.ink, 0, 0, 0.5); ring(fx, fy, 7, colour, 0, 0, 0.5);
  }
}
// marching dashes, two pixels wide with an ink edge below, drawn over everything
function dotRoute(r, colour) {
  const pts = [];
  for (let k = 0; k < r.length - 1; k++) {
    const a = r[k], b = r[k + 1];
    const [ax, ay] = tileMid(a % N, (a / N) | 0), [bx, by] = tileMid(b % N, (b / N) | 0);
    for (let s = 0; s < 8; s++) {
      if ((s + Math.floor(now * 8)) % 4 === 0) continue;
      const t = s / 8;
      pts.push([Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t)]);
    }
  }
  ctx.fillStyle = C.ink;
  for (const [x, y] of pts) ctx.fillRect(x - 1, y, 3, 2);
  ctx.fillStyle = colour;
  for (const [x, y] of pts) ctx.fillRect(x, y, 2, 1);
}

function drawPlacement(tool, x, y) {
  const [sx, sy] = tileTop(x, y);
  if (tool === "clear") {
    const info = clearInfo(x, y);
    drawTile(sx, sy, info ? C.gold : C.red, "edge");
    if (info) ui.previewText = [info[0], info[1] ? `+${info[1]} wood` : ""];
    else ui.previewText = [bAt(x, y) ? cantClear(bAt(x, y)) : "nothing to clear", ""];
    return;
  }
  const def = BD[tool], problem = placeProblem(def, x, y), afford = canAfford(def);
  drawTile(sx, sy, problem ? C.red : afford ? "#ffffff" : C.red, problem ? "edge" : "4");
  drawTile(sx, sy, problem ? C.red : C.green, "edge");
  if (!problem) {
    reachOf(tool, x, y);
    if (tool === "field") DIRS.forEach(([dx, dy]) => { const o = bAt(x + dx, y + dy); if (o && o.t === "field") drawTile(...tileTop(x + dx, y + dy), C.gold, "edge"); });
    if (tool === "ferry") for (const i of ferryLane(x, y) || []) drawTile(...tileTop(i % N, (i / N) | 0), C.sky, "4");
  }
  ui.previewText = problem ? [problem, ""] : !afford ? ["not enough " + RES.find(r => (S[r] || 0) < (costOf(def)[r] || 0)), ""] : previewFor(tool, x, y);
  ui.previewAt = [x, y];
}
function cantClear(b) {
  if (b.t === "hearth") return "the hearth stays";
  if (isHome(b)) return "someone lives here";
  return "homes need this well";
}
// a building's reach: a light wash inside, a solid border that pulses, and the
// tiles that count filled in `colour`
function ringTiles(x, y, r, pick, colour) {
  const pulse = Math.floor(now * 2.5) % 2;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (!inMap(x + i, y + j)) continue;
    const [sx, sy] = tileTop(x + i, y + j), hit = pick(x + i, y + j);
    drawTile(sx, sy, hit ? colour : "#ffffff", hit ? "6" : "3");
    if (hit) drawTile(sx, sy, colour, "edge");
    const sides = [j === -r && "NE", i === r && "SE", j === r && "SW", i === -r && "NW"].filter(Boolean);
    if (sides.length) {
      drawTile(sx, sy + 1, C.ink, "side:" + sides);
      drawTile(sx, sy, pulse ? colour : "#ffffff", "side:" + sides);
    }
  }
}

// what a building would do on this tile (cached per tile and tool)
function previewFor(tool, x, y) {
  const key = tool + ":" + x + ":" + y;
  if (ui.preview && ui.preview.key === key) return ui.preview.text;
  let t = ["", ""];
  const sh = shares(tool, x, y);
  if (tool === "field") t = [`+${sh[0]} food`, (meadow(x, y) ? "on a meadow, " : "") + `+${sh[1]} with a 2nd worker`];
  else if (tool === "woodcutter") { const n = treesNear(x, y); t = [`+${sh[0]} wood`, `${n} trees, +${sh[1]} with a 2nd worker`]; }
  else if (tool === "fisher") {
    const st = stretchOf(x, y), n = S.b.filter(b => b.t === "fisher" && stretchOf(b.x, b.y) === st).length;
    t = [`+${sh[0]} food`, n ? `shares its coast with ${n} fisher${n > 1 ? "s" : ""}` : `+${sh[1]} with a 2nd worker`];
  }
  else if (tool === "cottage") t = [`+${BD.cottage.beds + (nearWell(x, y) ? 1 : 0) + (streetFront(x, y) ? 1 : 0) + (nearLodge(x, y) ? 1 : 0)} beds`,
    streetFront(x, y) ? "street-front" : nearWell(x, y) ? "by a well" : nearLodge(x, y) ? "warm, by a lodge" : ""];
  else if (tool === "shepherd") t = [`+${sh[0]} wool`, `${grassNear(x, y)} grass tiles, ${R.flock} sheep`];
  else if (tool === "lodge") { const n = S.b.filter(c => isHome(c) && cheb(c, { x, y }) <= 2 && !nearLodge(c.x, c.y)).length; t = [`+${sh[0]} food`, `${n} home${n === 1 ? "" : "s"} warmed: +1 bed`]; }
  else if (tool === "pier") t = [`+${sh[0]} coins`, `${sandbarsNear(x, y)} sandbar tiles` + (wx().tide ? ", tide out" : "")];
  else if (tool === "causeway") t = ["a causeway", "walkable at any tide"];
  else if (tool === "seawall") t = ["a sea wall", "storm floods stop here"];
  else if (tool === "house") t = [`+${R.houseExtra} beds`, "while its people pass a market and meet"];
  else if (tool === "workshop") t = [`+${R.goods.perWood} goods`, "a worker, from 1 wood"];
  else if (tool === "stall") t = [`~${Math.min(4, Math.floor(S.foot[idx(x, y)] / 3))} coins`, `${S.foot[idx(x, y)]} steps here yesterday`];
  else if (tool === "bench") t = ["a seat", "passers meet on the way home"];
  else if (tool === "lamp") t = ["light", "for the street at night"];
  else if (tool === "flowers") t = ["flowers", "for the pleasure of it"];
  else if (tool === "market") {
    const n = forecast.walks.filter(w => [w.am, w.pm].some(r => r.slice(1, -1).some(i => i !== idx(x, y) && Math.max(Math.abs((i % N) - x), Math.abs(((i / N) | 0) - y)) <= R.marketReach))).length;
    t = [`~${n} coins`, "from today's walkers"];
  } else if (tool === "well") {
    const n = S.b.filter(c => c.t === "cottage" && cheb(c, { x, y }) <= R.wellRadius && !nearWell(c.x, c.y)).length;
    t = [`+${n} beds`, "for cottages nearby"];
  } else if (tool === "tavern") {
    const n = forecast.walks.filter(w => { const j = bById(w.job); return j && j.t !== "hearth" && Math.abs(j.x - x) + Math.abs(j.y - y) <= R.tavernReach; }).length;
    t = [`~${n} guests`, "after work"];
  } else if (tool === "lighthouse") t = ["+1 newcomer", "every night"];
  else if (tool === "townhall") t = ["+1 newcomer", `a night; ${BD.townhall.labour} builder-days`];
  else if (tool === "grandmarket") {
    const n = forecast.walks.filter(w => [w.am, w.pm].some(r => r.slice(1, -1).some(i => i !== idx(x, y) && Math.max(Math.abs((i % N) - x), Math.abs(((i / N) | 0) - y)) <= R.grandReach))).length;
    t = [`~${n} coins`, "from today's walkers, 2 tiles round"];
  } else if (tool === "reclaim") t = ["new land", "from the sea"];
  else if (tool === "longbridge") t = ["a long bridge", "over the strait"];
  else if (tool === "ferry") { const l = ferryLane(x, y); t = [`+${sh[0]} pearls`, l ? `a ferry across ${l.length} tiles` : ""]; }
  else if (tool === "bridge") t = ["crossing", ""];
  else if (tool === "grove") { const n = S.b.filter(b => b.t === "woodcutter" && cheb(b, { x, y }) <= R.cutterRadius).length; t = ["plant a tree", n ? `${n} woodcutter${n > 1 ? "s" : ""} nearby` : ""]; }
  ui.preview = { key, text: t };
  return t;
}

// the ghost building and its forecast, drawn above the objects
function drawGhost() {
  if (ui.title || !ui.tool || day.on) return;
  const tile = hoverTile();
  if (!tile) return;
  const [x, y] = tile, def = BD[ui.tool], [sx, sy] = tileTop(x, y);
  if (def && !placeProblem(def, x, y) && def.id !== "field" && def.id !== "bridge") {
    if (def.id === "grove") { ctx.globalAlpha = 0.65; spriteB("tree", sx, sy + 11); ctx.globalAlpha = 1; }
    else if (def.deco) { ctx.globalAlpha = 0.65; spriteB(def.id, sx, sy + 12); ctx.globalAlpha = 1; }
    else if (def.place === "cottage") drawBuilding({ t: "house", x, y, look: bAt(x, y).look, id: 0 }, 0.65, true);
    else drawBuilding({ t: def.id, x, y, look: 0, id: 0 }, 0.65, true);
  }
  const [a, b] = ui.previewText || ["", ""];
  if (!a) return;
  const w = Math.max(textWidth(a, "caps"), textWidth(b)) + 10, h = b ? 21 : 12;
  // above the building, but never tucked under the HUD
  const px = Math.round(sx - w / 2), py = Math.max(24, Math.round(sy - 40 - h / 2));
  bevel(px, py, w, h, "#10142a", C.winHi, C.ink);
  text(a, sx, py + 3, { font: "caps", colour: a.startsWith("+") || a.startsWith("~") ? C.green : a.startsWith("not") || !def && !clearInfo(x, y) || def && placeProblem(def, x, y) ? C.red : C.gold, align: "center" });
  if (b) text(b, sx, py + 12, { colour: C.dim, align: "center" });
  if (ui.mouse.touch && ui.tapTile) text("tap again to build", sx, py + h + 2, { colour: C.sky, align: "center" });
}

function tileClick(x, y) {
  if (day.on || !inMap(x, y)) return;
  if (ui.tool) {
    if (ui.mouse.touch && (!ui.tapTile || ui.tapTile[0] !== x || ui.tapTile[1] !== y)) { ui.tapTile = [x, y]; ui.preview = null; return; }
    ui.tapTile = null;
    if (ui.tool === "clear") {
      if (clearTile(x, y)) { afterChange(); sfx.chop(); const [sx, sy] = tileMid(x, y); burst(sx, sy, "#c49460", 10, 30); }
      else sfx.nope();
      return;
    }
    const def = BD[ui.tool];
    if (build(def, x, y)) {
      afterChange(); sfx.build();
      const [sx, sy] = tileMid(x, y);
      burst(sx, sy + 2, "#f4f0ea", 14, 36);
      if (!canAfford(def) || def.unique) ui.tool = null;
    } else sfx.nope();
    return;
  }
  // no tool: the merchant's cart opens its stall; else inspect whatever is there
  const cart = merchantCart();
  if (cart && cart[0] === x && cart[1] === y) return openShop();
  const b = ui.mouse.touch ? bAt(x, y) : buildingUnder(ui.mouse.wx, ui.mouse.wy);
  ui.inspectedB = b || null;
  if (b) { ui.inspected = b.id; ui.tapTip = "b:" + b.id; }
  ui.flyout = null;
}
function afterChange() { terrain.dirty = true; refreshForecast(); save(); }

// ---------------------------------------------------------------- tooltip

function buildingTip(b) {
  const def = BD[b.t], o = forecast && forecast.out[b.id];
  const lines = [];
  if (b.site) {
    const crew = Object.values(forecast.crew).filter(id => id === b.id).length, whole = BD[b.to || b.t].labour;
    lines.push(b.to ? `Being rebuilt as a *${BD[b.to].name.toLowerCase()}*.` : "A building site.");
    lines.push(`*${b.site}* of ${whole} builder-day${whole > 1 ? "s" : ""} to go; ` + (crew ? `*${crew}* builder${crew > 1 ? "s" : ""} tomorrow.` : "no free hands tomorrow."));
    if (!b.to) return [`${def.name.toUpperCase()} (SITE)`, ...lines];
  }
  if (isHome(b)) {
    const n = residents(b.id), beds = bedsOf(b), nd = forecast.needs[b.id];
    if (b.t === "house" && nd && !nd.met) lines.push(`*${n}* live here; *${beds}* beds open (${beds + R.houseExtra} with its needs met).`);
    else lines.push(`*${n}/${beds}* beds taken.`);
    if (b.t === "house" && nd) {
      lines.push(nd.met ? `Its *${R.houseExtra} extra beds* are open.` : `Its *${R.houseExtra} extra beds* stay closed until it has:`);
      lines.push(`${nd.market ? "+" : "-"} a market on someone's way`, `${nd.goods ? "+" : "-"} goods: *${nd.need}* tonight`, `${nd.company ? "+" : "-"} company in the evening`);
    }
    const mine = forecast.walks.filter(w => S.vil.find(v => v.id === w.v && v.home === b.id));
    for (const w of mine) {
      const j = bById(w.job), v = S.vil.find(o => o.id === w.v);
      lines.push(`${v.name} ${j.t === "hearth" ? "is idle, at the hearth" : w.build ? "builds the " + BD[j.to || j.t].name.toLowerCase() : "works at the " + BD[j.t].name.toLowerCase()}: walk *${w.commute.toFixed(1)}*`);
    }
  } else if (b.t === "hearth") {
    lines.push(def.desc);
    const n = forecast ? forecast.walks.filter(w => w.stop === b.id).length : 0;
    lines.push(n ? `*${n}* villager${n > 1 ? "s" : ""} will sit by the fire after work.` : `Nobody works within a walk of *${R.hearthReach}* to stop by.`);
  }
  else if (o) {
    const names = o.workers.map(id => (S.vil.find(v => v.id === id) || {}).name).filter(Boolean);
    if (o.flooded) lines.push("*Flooded* by the storm: nothing grows today.");
    else if (o.ashore) lines.push("A *storm*: the boats stay ashore today.");
    else if (o.resting) lines.push("*Resting* for the winter: no work until spring.");
    else if (!o.worker) lines.push("*No worker.* Every villager is busy, or none can walk here.");
    else {
      if (b.t === "lighthouse") lines.push(`${names[0]} tends the lamp: *one more newcomer* tonight.`);
      else lines.push(`Makes *${o.amt} ${o.res}* tomorrow.`);
      lines.push(`*${o.workers.length}/${o.slots}* job${o.slots > 1 ? "s" : ""} filled: ${names.join(", ")}.`);
      lines.push(`Longest walk: *${o.commute.toFixed(1)}*` + (o.tired ? `, tired *-${o.tired}*` : o.commute > R.tired[0] - 2 ? ", almost tiring" : ""));
    }
    if (def.serve) {
      const who = b.t === "market" ? "villager" : "guest", served = Math.min(o.base, def.serve * o.workers.length);
      lines.push(`${o.base} ${who}${o.base === 1 ? "" : "s"}` + (b.t === "tavern" && o.base >= R.tavernCheer ? ": cheerful!" : "") + `; each keeper serves *${def.serve}*.`);
      if (o.base > served) lines.push(`*${o.base - served}* more than its keepers can serve: ${o.slots < def.jobs ? "it takes on another tomorrow." : "build another."}`);
    }
    if (b.t === "fisher" && o.stretch) lines.push(`Its stretch of coast holds *${o.stretch.cap} fish* a day, shared by ${o.stretch.fishers} fisher${o.stretch.fishers > 1 ? "s" : ""}` + (o.short ? `: *-${o.short}*.` : "."));
    if (o.gulls) lines.push(`*Gulls* take *${o.gulls}*: nobody else walks past this shore field.`);
    if (b.t === "shepherd") lines.push(forecast.flocks.some(f => f.b === b.id) ? `Its *${R.flock} sheep* graze out and back, trampling a trail.` : "Its flock stays home: no pasture to walk to.");
    if (b.t === "lodge") lines.push("Homes within 2 tiles are warm: *+1 bed*." + (wx().winter ? "" : " Its hunters bring *3 each* in winter."));
    if (b.t === "pier") lines.push(wx().tide ? "The spring tide is out: *twice* the catch." : "Twice the catch while a *spring tide* is out.");
    if (b.t === "workshop") lines.push(o.noWood ? `*Out of wood*: workshops leave ${R.woodKeep} in store.` : `Uses *${o.workers.length} wood*.`);
    if (o.pearls) lines.push(`Sells *${o.pearls} pearls*: +${o.pearls * R.pearl.price} coins.`);
    if (b.t === "townhall") lines.push(forecast.hall ? "Its clerks write to the other islands: *one more newcomer* tonight." : "No clerk tomorrow: no letters go out.", "It brings the *grand market* and *reclaiming land* from the sea.");
    if (b.t === "grandmarket") lines.push("Those who pass it have *met someone*: a house's company need.");
    if (b.t === "ferry") { const l = ferryLane(b.x, b.y); lines.push(l ? `Its ferry crosses *${l.length}* tiles of water, *${R.ferry}* a tile.` : "No shore straight across: no ferry."); }
    if (o.slots < def.jobs && !def.serve && !["workshop", "ferry", "townhall"].includes(b.t)) lines.push(b.t === "fisher" ? "No fish left on its coast for a second hand." : "Not enough here for a second hand.");
  } else lines.push(def.desc);
  return [def.name.toUpperCase(), ...lines];
}

function drawTooltip() {
  let h = null;
  if (ui.tapTip) h = ui.hot.find(r => r.id === ui.tapTip) || (ui.tapTip.startsWith("b:") ? tileTipHot() : null);
  else if (ui.mouse.in && !ui.mouse.touch) {
    h = hitHot(ui.mouse.x, ui.mouse.y);
    if (!h && !ui.tool && !day.on && !ui.title) {
      const b = buildingUnder(ui.mouse.wx, ui.mouse.wy);
      if (b) { h = { x: ui.mouse.x, y: ui.mouse.y, w: 1, h: 1, tip: buildingTip(b) }; ui.inspected = b.id; }
      else {
        const [tx, ty] = screenToTile(ui.mouse.wx, ui.mouse.wy), d = deco(tx, ty), mt = inMap(tx, ty) && momentTip(tx, ty);
        if (d) h = { x: ui.mouse.x, y: ui.mouse.y, w: 1, h: 1, tip: decoTip(d, tx, ty) };
        else if (mt) h = { x: ui.mouse.x, y: ui.mouse.y, w: 1, h: 1, tip: mt };
      }
    }
  }
  if (!h || !h.tip) return;
  const [title, ...body] = h.tip, maxW = 140;
  const lines = body.flatMap(b => wrap(b, maxW));
  const w = Math.max(textWidth(title, "caps"), ...lines.map(l => textWidth(plain(l)))) + 12;
  const bh = 16 + lines.length * 9;
  const ax = ui.tapTip ? h.x + h.w / 2 : ui.mouse.x, ay = ui.tapTip ? h.y + h.h : ui.mouse.y;
  let x = Math.round(ax + 8), y = Math.round(ay + 10);
  if (x + w > VW - 2) x = Math.round(ax - w - 6);
  if (y + bh > VH - 2) y = Math.round(ay - bh - 4);
  x = Math.max(2, x); y = Math.max(2, y);
  bevel(x, y, w, bh, "#10142a", C.winHi, C.ink);
  text(title, x + 6, y + 4, { font: "caps", colour: C.gold });
  lines.forEach((l, i) => rich(l, x + 6, y + 14 + i * 9, C.dim));
}
function decoTip(d, x, y) {
  const lines = [d.desc];
  if (d.id === "stall") { const st = forecast.stalls.find(([i]) => i === idx(x, y)); lines.push(`Earns *${st ? st[1] : 0} coins* tomorrow.`); }
  return [d.name.toUpperCase(), ...lines];
}
function tileTipHot() {
  const b = bById(+ui.tapTip.slice(2));
  if (!b) return null;
  const [sx, sy] = tileTop(b.x, b.y);
  return { x: sx - 8, y: sy - 10, w: 16, h: 16, tip: buildingTip(b) };
}

// ------------------------------------------------------------ the merchant

function openShop() {
  if (!S.shop || S.shop.day !== S.day || day.on) return;
  Object.assign(ui, { shop: true, tool: null, flyout: null, tapTip: null });
  sfx.page();
}
// its wares, one row each: what it is, what's left, the price and BUY
function drawShop() {
  ui.hot = [];
  hotspot(0, 0, VW, VH, "sh:out", () => (ui.shop = false));
  ctx.fillStyle = ditherPattern(8, "#0a0c18");
  ctx.fillRect(0, 0, VW, VH);
  const wares = S.shop.wares, w = Math.min(VW - 8, 300), rowH = 21, h = 38 + wares.length * rowH + 6;
  const x = Math.round((VW - w) / 2), y = Math.max(2, Math.round((VH - h) / 2));
  hotspot(x, y, w, h, "sh:win", null);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 13, C.winLo);
  text("THE NIGHT MERCHANT", x + 7, y + 4, { font: "caps", colour: C.gold });
  const bx = x + w - 17, hv = hotspot(bx, y + 2, 14, 13, "sh:close", () => (ui.shop = false), { tip: ["CLOSE", "Back to the island. Key: Esc"] });
  buttonBox(bx, y + 2, 14, 13, { hover: hv, pressed: pressed("sh:close", hv) });
  icon("close", bx + 5, y + 6 + (pressed("sh:close", hv) ? 1 : 0), C.text);
  rich(`Its cart stands by the tavern until tonight. You have *${S.coin} coins*.`, x + 7, y + 20, C.dim);
  wares.forEach((ware, k) => {
    const ry = y + 34 + k * rowH, info = wareInfo(ware), ok = ware.left > 0 && S.coin >= ware.price, id = "sh:buy:" + ware.id;
    hotspot(x + 4, ry, w - 72, rowH - 1, "sh:row:" + ware.id, null, { tip: [info.name.toUpperCase(), info.desc] });
    if (ware.res) spriteC("i_" + ware.res, x + 11, ry + 7);
    else icon(ware.id === "reroll" ? "dice" : ware.id.startsWith("c:") ? "hat" : ware.id.startsWith("b:") ? "star" : "crate", x + 8, ry + 3, ware.left ? C.gold : C.faint);
    text(info.name.toUpperCase(), x + 20, ry + 1, { font: "caps", colour: ware.left ? C.text : C.faint });
    text(ware.left ? `${ware.left} left` : "sold out", x + 20, ry + 10, { colour: C.faint });
    const px = x + w - 70;
    spriteC("i_coin", px + 2, ry + 6);
    text(String(ware.price), px + 10, ry + 2, { colour: S.coin >= ware.price ? C.coin : C.red });
    smallButton(id, x + w - 38, ry + 1, 32, "BUY", () => {
      if (!buyWare(ware.id)) return sfx.nope();
      sfx.build(); ui.bump.coin = 0.15; refreshForecast(); save();
    }, { disabled: !ok, accent: ok ? C.gold : null });
  });
}

// ----------------------------------------------------------------- dialog

function modal(title, body, ok = "OK", cancel = null) {
  return new Promise(res => (ui.modal = { title, body, ok, cancel, res }));
}
function drawModal() {
  const m = ui.modal;
  ui.hot = [];
  ctx.fillStyle = ditherPattern(8, "#0a0c18");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(230, VW - 16), lines = m.body.flatMap(b => wrap(b, w - 20));
  const h = 32 + lines.length * 10 + 22, x = Math.round((VW - w) / 2), y = Math.round((VH - h) / 2);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 17, C.winLo);
  text(m.title, x + w / 2, y + 3, { font: "big", colour: C.gold, align: "center" });
  lines.forEach((l, i) => rich(l, x + 10, y + 26 + i * 10));
  const btns = m.cancel ? [[m.cancel, false], [m.ok, true]] : [[m.ok, true]];
  const bw = 64, gap = 8, total = btns.length * bw + (btns.length - 1) * gap;
  btns.forEach(([label, val], i) => {
    const bx = Math.round(x + (w - total) / 2 + i * (bw + gap)), by = y + h - 19, id = "m" + i;
    const hov = hotspot(bx, by, bw, 14, id, () => { ui.modal = null; m.res(val); });
    buttonBox(bx, by, bw, 14, { hover: hov, pressed: pressed(id, hov), accent: val ? C.gold : null });
    text(label.toUpperCase(), bx + bw / 2, by + 3 + (pressed(id, hov) ? 1 : 0), { font: "caps", colour: val ? C.text : C.dim, align: "center" });
  });
}

// --------------------------------------------------------------- the frame

function drawUI(dt) {
  ui.hot = [];
  if (ui.title) { drawMenus(); drawTooltip(); return; }
  if (visiting) { drawVisitBar(); drawTooltip(); return; }
  drawHUD(dt);
  drawBar();
  drawCorner();
  if (ui.flyout) drawFlyout(barLayout());
  drawDev();
  drawTooltip();
}
function drawOverlays(dt) {
  if (ui.shop) { if (S.shop && S.shop.day === S.day && !day.on) { drawShop(); drawTooltip(); } else ui.shop = false; }
  if (ui.chart) { drawChart(); drawTooltip(); }
  if (ui.stats) { drawStats(); drawTooltip(); }
  if (ui.codex) drawCodex();
  if (ui.card && !ui.title && !ui.chart) { drawNewsCard(dt); drawTooltip(); }
  if (ui.modal) drawModal();
}

// ------------------------------------------------------------------ actions

function toggleMute() {
  PROFILE.muted = !PROFILE.muted;
  if (AC) { master.gain.value = PROFILE.muted ? 0 : 0.8; AC[PROFILE.muted ? "suspend" : "resume"](); }
  if (!PROFILE.muted) initAudio();
  saveProfile();
}

// ------------------------------------------------------------------ input

ucvs.addEventListener("contextmenu", e => e.preventDefault());
// two fingers pinch-zoom in whole steps
const touches = new Map();
let pinch = null;
function pinchDist() { const [a, b] = [...touches.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }

ucvs.addEventListener("pointerdown", e => {
  initAudio();
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size === 2) { pinch = { d: pinchDist() }; ui.drag = null; ui.press = null; ui.tapTile = null; return; }
  const [x, y] = toLogical(e), [wx, wy] = toWorld(e);
  ui.mouse = { x, y, wx, wy, in: true, touch: e.pointerType !== "mouse" };
  try { ucvs.setPointerCapture(e.pointerId); } catch { /* synthetic pointers can't be captured */ }
  const h = hitHot(x, y);
  if (!h || h.id !== ui.tapTip) ui.tapTip = null;
  if (ui.sleep && (!h || h.id !== "sleep")) ui.sleep = false; // any click wakes the village
  if (e.button === 2) { ui.tool = null; ui.tapTile = null; ui.flyout = null; return; }
  if (ui.modal || ui.codex || ui.title || ui.chart || ui.shop || ui.card || ui.stats) { if (h) ui.press = h.id; return; }
  if (h) { ui.press = h.id; return; }
  // on the map: a drag pans, a click acts on the tile
  ui.drag = { x, y, wx, wy, cx: cam.x, cy: cam.y, moved: false };
});

ucvs.addEventListener("pointermove", e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && touches.size === 2) {
    const k = pinchDist() / pinch.d;
    if (k > 1.3 || k < 0.77) { setZoom(k > 1 ? 1 : -1); pinch.d = pinchDist(); }
    return;
  }
  const [x, y] = toLogical(e), [wx, wy] = toWorld(e);
  ui.mouse = { x, y, wx, wy, in: true, touch: e.pointerType !== "mouse" };
  if (ui.drag) {
    const dx = x - ui.drag.x, dy = y - ui.drag.y;
    if (!ui.drag.moved && Math.hypot(dx, dy) > 3) ui.drag.moved = true;
    if (ui.drag.moved) {
      cam.x = ui.drag.cx + wx - ui.drag.wx; cam.y = ui.drag.cy + wy - ui.drag.wy; clampCamera();
      ui.panned += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    }
  }
});

function pointerEnd(e) {
  touches.delete(e.pointerId);
  if (pinch) { if (!touches.size) pinch = null; ui.drag = null; ui.press = null; return; }
  const [x, y] = toLogical(e);
  if (ui.press) {
    const h = hitHot(x, y);
    if (h && h.id === ui.press && h.onClick) h.onClick();
  } else if (ui.drag && !ui.drag.moved && !ui.modal && !ui.codex && !ui.title && !ui.chart && !ui.shop && !ui.card && !ui.stats && !visiting) {
    const [tx, ty] = screenToTile(...toWorld(e));
    tileClick(tx, ty);
  }
  if (ui.drag && ui.drag.moved) { S.cam = [cam.x, cam.y]; }
  ui.press = null; ui.drag = null;
  if (e.pointerType !== "mouse") ui.mouse.in = false;
}
ucvs.addEventListener("pointerup", pointerEnd);
ucvs.addEventListener("pointercancel", pointerEnd);
ucvs.addEventListener("pointerleave", () => { if (!ui.drag) ui.mouse.in = false; });

// zoom in whole-pixel steps, keeping the point under the screen centre in place
function setZoom(d) {
  const V = VIEW.world, cx = V.w / 2 - cam.x, cy = V.h / 2 - cam.y, old = zoom;
  zoom += d;
  fitScreen();
  if (zoom === old) return;
  cam.x = Math.round(V.w / 2 - cx); cam.y = Math.round(V.h / 2 - cy); clampCamera();
  S.cam = [cam.x, cam.y];
  PROFILE.zoom = zoom; saveProfile();
}
ucvs.addEventListener("wheel", e => {
  e.preventDefault();
  if (ui.title || ui.codex || ui.modal) return;
  setZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

addEventListener("keydown", e => {
  if (typing()) { if (e.key === "Enter" || e.key === "Escape") stopTyping(); return; }
  if (ui.card && !ui.modal && !ui.title) { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); if (ui.card.t > 0.3) closeCard(); } return; }
  if (e.key === "Escape") {
    if (ui.modal) { const m = ui.modal; ui.modal = null; m.res(false); }
    else if (ui.stats) closeStats();
    else if (ui.shop) ui.shop = false;
    else if (ui.chart) { if (chart.mode === "depart" && chart.step !== "island") chartBack(); else closeChart(); }
    else if (visiting) endVisit();
    else if (ui.codex) closeCodex();
    else if (ui.tool || ui.flyout) { ui.tool = null; ui.flyout = null; }
    else if (ui.title && ui.menu !== "title") ui.menu = "title";
    return;
  }
  if (ui.modal) { if (e.key === "Enter") { const m = ui.modal; ui.modal = null; m.res(true); } return; }
  if (ui.title) { if (ui.menu === "title" && (e.key === "Enter" || e.key === " ")) titleDefault(); return; }
  if (e.key === "h" || e.key === "?") return ui.codex ? closeCodex() : openCodex();
  if (e.key === "`" || e.code === "Backquote") return toggleDev();
  if (e.key === "c" || e.key === "C") return ui.stats ? closeStats() : !ui.codex && !ui.chart && !ui.shop && !visiting && openStats();
  if (ui.codex || ui.chart || ui.shop || ui.stats || visiting) return;
  if (e.key === "m" || e.key === "M") return openChart("view");
  if (ui.sleep && e.key !== "z" && e.key !== "Z") ui.sleep = false;
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); startDay(); return; }
  if (e.key === "z" || e.key === "Z") return toggleSleep();
  const n = parseInt(e.key, 10);
  if (n >= 1) { const t = TOOLS()[n - 1]; if (t) selectTool(t); return; }
  if (e.key === "p" || e.key === "P") return togglePaths();
  if (e.key === "+" || e.key === "=") return setZoom(1);
  if (e.key === "-") return setZoom(-1);
  const pan = { ArrowLeft: [24, 0], ArrowRight: [-24, 0], ArrowUp: [0, 24], ArrowDown: [0, -24], a: [24, 0], d: [-24, 0], w: [0, 24], s: [0, -24] }[e.key];
  if (pan) { cam.x += pan[0]; cam.y += pan[1]; clampCamera(); ui.panned += 24; S.cam = [cam.x, cam.y]; }
});
