/* Boot, the main loop and milestone celebrations.  The menus are in setup.js. */
"use strict";

// an island was loaded or generated: reset the view and everything drawn from the old one
function enterIsland() {
  reindex();
  terrain.dirty = true;
  initGlints();
  if (S.cam) { cam.x = S.cam[0]; cam.y = S.cam[1]; clampCamera(); } else centreCamera();
  Object.assign(day, { on: false, walkers: [], boats: [] });
  ui.tool = null; ui.inspectedB = null; ui.tapTip = null; ui.preview = null;
  fx.floats.length = 0; fx.parts.length = 0; // nothing floats over from the island before
  night.k = 0;
  refreshForecast();
  tutInit();
}

// --------------------------------------------------------------- milestones

const fireworks = { until: 0, next: 0, big: false };
function celebrate(m) {
  sfx.milestone();
  const L = barLayout();
  if (m.last) return grandFestival();
  if (m.festival) {
    fireworks.until = now + 8;
    screenText(VW / 2, VH / 2 - 60, m.last ? "VOYAGE COMPLETE!" : "FESTIVAL!", C.gold, "big", 4);
    screenText(VW / 2, VH / 2 - 40, `${pop()} villagers call this island home`, C.text, "small", 4);
    if (!m.last && unlocked(BD.ship)) screenText(VW / 2, VH / 2 - 28, "the ship can be built: the sea is calling", C.sky, "small", 4);
    return;
  }
  screenText(VW / 2, VH / 2 - 50, `${m.pop} VILLAGERS`, C.text, "caps", 3);
  screenText(VW / 2, VH / 2 - 38, "NEW: " + m.unlock.map(u => BD[u].name.toUpperCase()).join(" + "), C.gold, "caps", 3);
  for (const u of m.unlock) {
    const i = L.tools.indexOf(cardOf(u));
    if (i >= 0) burst(L.x + i * (L.cw + L.gap) + 13, L.y + 10, C.gold, 20, 50, true);
  }
}
function drawFireworks() {
  if (now > fireworks.until) { fireworks.big = false; return; }
  if (now > fireworks.next) {
    const big = fireworks.big;
    fireworks.next = now + (big ? 0.1 + Math.random() * 0.15 : 0.25 + Math.random() * 0.3);
    const cols = [C.gold, C.red, C.sky, C.green, "#ffffff", "#f7b0c0"], x = 40 + Math.random() * (VW - 80), y = 30 + Math.random() * VH * 0.4;
    burst(x, y, cols[(Math.random() * cols.length) | 0], big ? 44 : 26, big ? 110 : 70);
    // the Grand Festival's: a second ring inside the first, in another colour
    if (big && Math.random() < 0.5) burst(x, y, cols[(Math.random() * cols.length) | 0], 20, 45);
    pluck(pent(10 + ((Math.random() * 6) | 0)), 0.02, 0.6);
  }
}

// the voyage's last goal: the Grand Festival.  Every settled island sends a boat, a crowd
// of sails comes with them, the fireworks come back bigger, and then the voyage is complete
function grandFestival() {
  fireworks.until = now + 14; fireworks.big = true;
  screenText(VW / 2, VH / 2 - 64, "THE GRAND FESTIVAL", C.gold, "big", 5);
  screenText(VW / 2, VH / 2 - 44, `${pop()} villagers, and the whole realm sails in`, C.text, "small", 5);
  // the boats: to open water by the shore, from far out in the same direction
  const sea = openSea(), shores = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (S.ground[i] === "~" && sea[i] && DIRS.some(([dx, dy]) => isLand(x + dx, y + dy))) shores.push([x, y]);
  }
  const c = (N - 1) / 2, cols = ["#e8604a", "#ffd66b", "#8fd8ff", "#a6e36b", "#f7b0c0", "#ffffff"];
  const names = W ? W.islands.map(i => i.name) : [];
  grandFleet.boats = [];
  const n = Math.min(shores.length, names.length + 10);
  for (let k = 0; k < n; k++) {
    const [tx, ty] = shores[Math.floor(((k + 0.5) / n) * shores.length)], a = Math.atan2(ty - c, tx - c);
    grandFleet.boats.push({ to: [tx, ty], from: [tx + Math.cos(a) * 12, ty + Math.sin(a) * 12], t0: now + 0.4 + k * 0.35, dur: 4 + (k % 3),
      big: k < names.length, name: names[k] || null, col: cols[k % cols.length], ph: k });
  }
  grandFleet.until = now + 60;
  setTimeout(() => { if (W && W.voyage.done) grandCard(); }, 9000 / Math.max(1, TIME_SCALE));
}
// what the voyage came to, and what's next: sail on (endless), a new world, or stay
function grandCard() {
  const isl = W.islands, days = isl.reduce((a, i) => a + i.days, 0) + S.day;
  const charters = Object.values(W.voyage.charters).flat().length + chartersMet().length, secrets = new Set([...(W.voyage.secrets || []), ...(S.secrets || [])]).size;
  showCard({ title: "VOYAGE COMPLETE", sub: W.name, art: artGrand,
    lines: [`*${isl.length + 1}* island${isl.length ? "s" : ""} in *${days}* days: a realm of *${realmPop()}* villagers. *${charters}* charter${charters === 1 ? "" : "s"} met, *${secrets}* secret${secrets === 1 ? "" : "s"} found.`,
      "The world is kept. *Sail on* to islands without end (each goal 25 higher), or start a *new world*."],
    buttons: [{ label: "SAIL ON", accent: C.gold, fn: sailOn, tip: ["SAIL ON", "An endless voyage: the ship can be built again, and the chart offers new islands, bigger each time (up to 40 tiles)."] },
      { label: "NEW WORLD", fn: () => { openTitle(); openSetup(); } },
      { label: "STAY", fn: null, tip: ["STAY", "Keep building here. The VOYAGE COMPLETE plate opens this again."] }] });
}
function sailOn() {
  W.voyage.endless = true;
  chron("voyage", "The voyage *sails on*, without end.");
  refreshForecast(); save();
  screenText(VW / 2, VH / 2 - 50, "THE SEA IS CALLING", C.gold, "caps", 3);
  screenText(VW / 2, VH / 2 - 38, "build the ship again, and sail on", C.text, "small", 3);
}
// the card's picture: the fleet round the island, fireworks over it
function artGrand(b) {
  const at = artGrass(b, 3, 2, b.x + b.w / 2 - 16, b.y + 18), [hx, hy] = at(1, 0);
  spriteB("hearth", hx, hy + 13); flame(hx, hy + 4, 1);
  spriteB("townhall", at(2, 1)[0], at(2, 1)[1] + 15); spriteB("cottage", at(0, 1)[0], at(0, 1)[1] + 14);
  for (let k = 0; k < 4; k++) { const t = (now * 0.15 + k / 4) % 1, x = b.x + (k % 2 ? b.w - 20 - t * 40 : 20 + t * 40); spriteB(k < 2 ? "ship" : "boat", x, b.y + b.h - 4 - (k >> 1) * 8 + Math.round(Math.sin(now * 2 + k)), k % 2 === 1); }
  for (let k = 0; k < 18; k++) { const t = (now * 0.7 + k * 0.29) % 1, a = k * 2.1; if (t < 0.6) rect(Math.round(b.x + b.w / 2 + ((k % 5) - 2) * 36 + Math.cos(a) * t * 18), Math.round(b.y + 12 + Math.sin(a) * t * 10), 1, 1, [C.gold, C.red, C.sky, C.green, "#ffffff"][k % 5]); }
}

// -------------------------------------------------------------------- loop

let last = performance.now(), saveTimer = 10;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  now += dt;
  tutUpdate(dt);
  devUpdate();
  updateDay(dt);
  // the island in its view, then the menus over it in theirs
  useView(VIEW.world);
  drawWorld(dt);
  drawFireworks();
  if (!ui.title && !visiting) drawGhost();
  useView(VIEW.ui);
  ctx.clearRect(0, 0, VW, VH);
  drawUI(dt);
  drawTutorial();
  drawFx(dt, true);
  drawOverlays(dt);
  if ((saveTimer -= dt) <= 0) { saveTimer = 10; if (!day.on) save(); }
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------------- demo

// ?demo: a village grown by the player bot (bot.js) over 30 days (?days=N; never saved)
function demoState() {
  S = freshState(+params.get("demo") || 20260925);
  S.seen = true;
  reindex(); refreshForecast();
  simDays(+(params.get("days") || 30), true);
  S.cam = null;
}
// play days instantly, no animation; with the bot building each morning
function simDays(n, withBot) {
  for (let d = 0; d < n; d++) {
    if (withBot) botTurn();
    const P = plan();
    applyWork(P); applyNight(P); checkMilestones();
  }
  terrain.dirty = true;
  refreshForecast();
}

// -------------------------------------------------------------------- boot

async function boot() {
  [IMG.atlas, IMG.title, IMG.chart] = await Promise.all([loadImage("assets/atlas.png"), loadImage("assets/title.png"), loadImage("assets/chart.png")]);
  fitScreen();
  reindex();
  if (params.has("demo")) demoState();
  enterIsland();
  ui.title = !params.has("demo") && !params.has("play");
  addEventListener("resize", () => { fitScreen(); if (!S.cam) centreCamera(); else clampCamera(); });
  addEventListener("beforeunload", () => { if (!day.on) save(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && !day.on) save(); });
  requestAnimationFrame(t => { last = t; frame(t); });
}

boot();
