/* The dev menu: the player bot (bot.js) and a few cheats, for trying things out.
 * Opens with the ` key, or the DEV corner button when the page has ?dev.
 * Drawn like every other menu: immediate mode, hotspots, pixel buttons.
 */
"use strict";

const dev = { open: false, auto: false, flash: [] };

function toggleDev() { dev.open = !dev.open; if (!dev.open) dev.auto = false; sfx.click(); }

// the bot plans today's building; each new thing gets a puff and a label
function devBotBuild() {
  if (day.on) return [];
  const n0 = bot.log.length, built = botTurn();
  for (const [, t, x, y] of bot.log.slice(n0)) {
    const [sx, sy] = tileMid(x, y);
    burst(sx, sy + 2, t === "fell" ? "#c49460" : "#f4f0ea", 10, 30);
    floatText(sx, sy - 22, t === "grove" ? "tree" : t, t === "fell" ? C.wood : C.sky, "small", null, 2.2);
  }
  if (built.length) { afterChange(); sfx.build(); }
  return built;
}
function devBotDay() {
  if (day.on) return;
  devBotBuild();
  startDay();
}
function devSkip(n) {
  if (day.on) return;
  const d0 = S.day, p0 = pop();
  simDays(n, true);
  save();
  screenText(VW / 2, VH / 2 - 40, `DAY ${d0} > ${S.day}`, C.gold, "caps", 2.5);
  screenText(VW / 2, VH / 2 - 28, `${p0} > ${pop()} villagers`, C.text, "small", 2.5);
}
function devGive(r, n) { S[r] += n; refreshForecast(); ui.bump[r] = 0.15; save(); }

// autoplay: while it's on, every quiet morning the bot builds and ends the day
function devUpdate() {
  if (dev.auto && !day.on && !ui.modal && !ui.codex && !ui.title) devBotDay();
}

function drawDev() {
  if (params.has("dev") && !ui.title) {
    // the corner button, right of the others
    const [x, y] = cornerSlot(7), hv = hotspot(x, y, 22, 12, "dev", toggleDev, { tip: ["DEV", "The player bot and cheats. Key: `"] });
    buttonBox(x, y, 22, 12, { hover: hv, pressed: pressed("dev", hv) || dev.open });
    text("DEV", x + 11, y + 3, { colour: dev.open ? C.gold : C.dim, align: "center" });
  }
  if (!dev.open || ui.title) return;
  const w = 118, x = 22, y = 54, rowH = 15;
  const rows = [
    ["dev:build", "BOT: BUILD", "The bot builds what the village needs today, then waits for you.", devBotBuild],
    ["dev:day", "BOT: PLAY DAY", "The bot builds, then ends the day.", devBotDay],
    ["dev:auto", "AUTOPLAY", "The bot keeps playing, day after day, until you switch it off.", () => (dev.auto = !dev.auto)],
    ["dev:skip", "SKIP 10 DAYS", "Ten days at once, no animation: the bot builds each morning.", () => devSkip(10)],
    ["dev:unlock", "UNLOCK ALL", "Every building, without the villagers for it.", () => { S.ms = Math.max(S.ms, MILESTONES.length - 1); refreshForecast(); save(); }],
  ];
  const h = 16 + rows.length * rowH + 16 + 34;
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 11, C.winLo);
  text("DEV", x + 6, y + 3, { font: "caps", colour: C.gold });
  const cx = x + w - 15, chv = hotspot(cx, y + 2, 12, 11, "dev:close", toggleDev);
  buttonBox(cx, y + 2, 12, 11, { hover: chv, pressed: pressed("dev:close", chv) });
  icon("close", cx + 4, y + 5, C.text);

  rows.forEach(([id, label, tip, fn], i) => {
    const by = y + 15 + i * rowH, hv = hotspot(x + 4, by, w - 8, 13, id, fn, { tip: [label, tip] });
    const off = day.on && id !== "dev:auto" && id !== "dev:unlock";
    buttonBox(x + 4, by, w - 8, 13, { hover: hv, pressed: pressed(id, hv), disabled: off });
    const d = pressed(id, hv) ? 1 : 0;
    text(label, x + 9, by + 3 + d, { font: "caps", colour: off ? C.faint : C.text });
    if (id === "dev:auto") text(dev.auto ? "ON" : "OFF", x + w - 9, by + 3 + d, { font: "caps", colour: dev.auto ? C.green : C.faint, align: "right" });
  });

  // cheats: a little of each resource
  const gy = y + 15 + rows.length * rowH, gw = Math.floor((w - 8 - 2 * (RES.length - 1)) / RES.length);
  RES.forEach((r, i) => {
    const gx = x + 4 + i * (gw + 2), id = "dev:give:" + r, n = r === "food" ? 30 : r === "goods" ? 20 : 50;
    const hv = hotspot(gx, gy, gw, 13, id, () => devGive(r, n), { tip: ["+" + n + " " + r.toUpperCase(), "A gift, no questions asked."] });
    buttonBox(gx, gy, gw, 13, { hover: hv, pressed: pressed(id, hv) });
    spriteC("i_" + r, gx + 6, gy + 7);
    text("+" + n, gx + 11, gy + 3, { colour: C[r] });
  });

  // what the bot did last
  const ly = gy + 17;
  text("BOT LOG", x + 6, ly, { colour: C.faint });
  bot.log.slice(-3).reverse().forEach(([d, t, bx, byy], i) =>
    text(`day ${d}: ${t === "grove" ? "tree" : t} ${bx},${byy}`, x + 6, ly + 9 + i * 8, { colour: i ? C.faint : C.dim }));
}
