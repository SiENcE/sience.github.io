// Headless play-through over the Chrome DevTools protocol.   node tools/playtest.mjs
// Every menu is drawn into the canvas, so clicks go through real mouse events
// at the screen position of a hotspot, and assertions read game state.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const page = pathToFileURL(resolve("index.html")).href;
const profile = mkdtempSync(join(tmpdir(), "bloom-px-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  "--window-size=1600,900", "--mute-audio", page]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise(res => {
  const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(expr + " -> " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failed++;
}
async function shot(file) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(r.data, "base64"));
}
// logical pixel -> CSS pixel of the scaled canvas
async function css(lx, ly) {
  return ev(`(() => { const r = cvs.getBoundingClientRect();
    return [r.left + (${lx} + 0.5) * r.width / VW, r.top + (${ly} + 0.5) * r.height / VH]; })()`);
}
async function mouse(type, lx, ly) {
  const [x, y] = await css(lx, ly);
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
}
async function clickAt(lx, ly) {
  await mouse("mouseMoved", lx, ly); await mouse("mousePressed", lx, ly); await mouse("mouseReleased", lx, ly);
  await sleep(60);
}
// click the centre of a hotspot registered in the last frame
async function clickHot(id) {
  const h = await ev(`(() => { const h = ui.hot.find(h => h.id === ${JSON.stringify(id)}); return h && [h.x, h.y, h.w, h.h]; })()`);
  if (!h) throw new Error("no hotspot " + id);
  await clickAt(Math.floor(h[0] + h[2] / 2), Math.floor(h[1] + h[3] / 2));
}

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === "page"); } catch { /* not up */ }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || JSON.stringify(d.params.exceptionDetails).slice(0, 600));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(JSON.stringify(d.params.args));
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  await sleep(1500);
  await ev("localStorage.clear(); S = freshState(); rebuildMods(); creatures = []; links.clear(); tutReset(); 1");

  // the screen: integer scale, crisp
  const scr = await ev("({ VW, VH, PX, w: cvs.style.width, smooth: ctx.imageSmoothingEnabled, fonts: Object.keys(ATLAS.fonts), atlas: !!IMG.atlas, bg: !!IMG.bg })");
  check("screen is a whole-number upscale", Number.isInteger(scr.PX) && scr.PX >= 1 && !scr.smooth, `${scr.VW}x${scr.VH} x${scr.PX}`);
  check("atlas, background and 3 fonts loaded", scr.atlas && scr.bg && scr.fonts.length === 3);
  check("every creature has a dark body and a glow mask for deep water",
    await ev("SPECIES.flatMap(s => s.frames || [s.spr]).every(n => ATLAS.sprites[n + '_d'] && ATLAS.sprites[n + '_e'])"));
  check("the reef starts in sunlit water, with no darkness", await ev("Z.id === 'twilight' && LT.ambient === 0 && LT.sun === 1"));

  // a new game: only the heart is taught, the advanced HUD is hidden
  await sleep(100);
  check("new game starts on the tap lesson", (await ev("tut.active")) === "tap");
  check("resonance, current and descend start hidden",
    await ev("tut.reveal.res === 0 && tut.reveal.current === 0 && tut.reveal.descend === 0"));

  // taps
  const [hx, hy] = await ev("[play.cx, play.cy]");
  for (let i = 0; i < 5; i++) await clickAt(hx, hy);
  check("five taps finish the tap lesson", await ev("learned('tap')"));
  check("taps send motes into the counter", (await ev("motes.length")) > 0);
  for (let i = 0; i < 15; i++) await clickAt(hx, hy);
  check("20 real clicks on the heart give 20 lumen", Math.round(await ev("S.lumen")) === 20, (await ev("S.lumen")).toFixed(1));
  check("tap ripples stay capped", (await ev("heart.rings.length")) <= 8, await ev("heart.rings.length") + " rings");

  // shop through the canvas menu
  check("with 15 lumen the buy lesson points at the Glowmote", (await ev("tut.active")) === "buy");
  await clickHot("s:plankton");
  check("clicking the Glowmote row buys one", (await ev("S.owned.plankton")) === 1 && (await ev("creatures.length")) === 1);
  await sleep(100);
  check("then the income lesson streams light to the counter", (await ev("tut.active")) === "income");
  check("unaffordable row does nothing", await (async () => { await clickHot("s:jelly"); return !(await ev("S.owned.jelly")); })());
  await ev("gain(1e7); 1"); await sleep(50);
  await clickHot("mode10");
  check("buy-mode toggle", (await ev("ui.buyMode")) === 10);
  for (const id of ["plankton", "jelly", "seahorse", "angler", "nautilus"]) { await sleep(40); await clickHot("s:" + id); }
  await clickHot("mode1");
  check("x10 purchases across five species", await ev("SPECIES.slice(0,5).every(s => S.owned[s.id] >= 10)"), await ev("JSON.stringify(S.owned)"));
  await sleep(50);
  const u0 = await ev("S.upg.length");
  const firstU = await ev("ui.hot.find(h => h.id.startsWith('u:'))?.id");
  await clickHot(firstU);
  check("clicking a mutation buys it", (await ev("S.upg.length")) === u0 + 1, firstU);
  await mouse("mouseMoved", ...(await ev("(() => { const h = ui.hot.find(h => h.id.startsWith('s:')); return [h.x + 10, h.y + 8]; })()")));
  await sleep(80);
  check("hovering a row shows a tooltip", !!(await ev("(hitHot(ui.mouse.x, ui.mouse.y) || {}).tip")));
  const scrolled = await ev("ui.maxScroll");
  if (scrolled > 0) {
    const [px, py] = await css((await ev("panel.x")) + 60, (await ev("panel.y + panel.h")) - 60);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: px, y: py, deltaX: 0, deltaY: 120 });
    await sleep(50);
    check("wheel scrolls the creature list", (await ev("ui.scroll")) > 0);
  }

  // the first thread plays as a slow-motion moment and reveals the resonance plate
  const sawMoment = await ev(`new Promise(r => { const t0 = performance.now();
    (function poll() { if (tut.moment) return r(tut.slow < 1);
      if (learned("thread") || performance.now() - t0 > 8000) return r(false); setTimeout(poll, 20); })(); })`);
  check("first thread plays in slow motion", sawMoment);
  await sleep(3000);
  check("thread lesson learned and resonance plate revealed", await ev("learned('thread') && tut.reveal.res === 1"));

  // resonance
  await sleep(1000);
  check("threads form between species", (await ev("linkCount")) > 0, (await ev("linkCount")) + " threads");
  check("resonance rises", (await ev("resonance")) > 1.05, "x" + (await ev("resonance")).toFixed(2));
  check("no same-species threads", await ev("[...links.values()].filter(l => l.alive).every(l => l.a.s !== l.b.s)"));
  const r1 = await ev("rate()"), l2 = await ev("S.lumen");
  await sleep(1000);
  check("idle income matches rate", Math.abs(((await ev("S.lumen")) - l2) / r1 - 1) < 0.35);

  // the current, held with a real mouse button
  const p0 = await ev("linkCount + charged"), res0 = await ev("resonance");
  const [cx, cy] = await ev("[play.cx - 60, play.cy + 10]");
  await mouse("mouseMoved", cx, cy); await mouse("mousePressed", cx, cy);
  await sleep(1500);
  await shot("screenshots/current.png");
  await sleep(700);
  const e = await ev("current.energy"), ch = await ev("charged"), p1 = await ev("linkCount + charged"), res1 = await ev("resonance");
  await mouse("mouseReleased", cx, cy);
  check("holding the water pulls a current", e < 100 && !(await ev("current.on")), e.toFixed(0) + "% left, released");
  check("current charges threads and lifts resonance", ch > 0 && p1 > p0 && res1 > res0,
    `${ch} charged, power ${p0} → ${p1}, x${res0.toFixed(2)} → x${res1.toFixed(2)}`);

  // spore
  await ev("spore = { x: 40, y: play.cy, vx: 0, t: 0 }; 1");
  await clickAt(40, await ev("Math.round(play.cy)"));
  check("clicking a spore catches it", (await ev("spore")) === null);

  // descent through the pixel dialog
  await ev("S.allTime = 4.2e6; 1"); await sleep(500);
  check("descend button revealed once there is light for a pearl", (await ev("tut.reveal.descend")) === 1);
  check("descend lesson points at it", (await ev("tut.active")) === "descend");
  await clickHot("descend");
  await sleep(50);
  check("descend opens a dialog", !!(await ev("ui.modal")), await ev("ui.modal && ui.modal.title"));
  await clickHot("m1");
  await sleep(1700);
  await shot("screenshots/descent.png");
  check("the camera sinks through the strip between zones", await ev("descent.active && descent.cam > 0"),
    `${Math.round(await ev("descent.cam"))}px down`);
  check("the depth counter counts down with it", await ev("descent.p > 0 && descent.p < 1"));
  const sank = await ev(`new Promise(r => { const t0 = performance.now();
    (function poll() { if (!descent.active) return r(true); if (performance.now() - t0 > 6000) return r(false);
      setTimeout(poll, 50); })(); })`);
  check("the descent finishes", sank);
  check("descent grants pearls and depth", (await ev("S.pearls")) === 2 && (await ev("S.depth")) === 1);
  check("descent resets the reef", (await ev("Object.keys(S.owned).length")) === 0 && (await ev("S.lumen")) < 1);
  check("the new zone is the Midnight Trench, and it is dark", await ev("Z.id === 'trench' && LT.ambient >= 4 && LT.sun < 1"),
    await ev("Z.name + ', darkness ' + LT.ambient"));
  const relit = await ev(`new Promise(r => { const t0 = performance.now();
    (function poll() { if (lightMap.fade === 1 && lightMap.heartFade === 1) return r(true);
      if (performance.now() - t0 > 8000) return r(lightMap.fade + " / " + lightMap.heartFade); setTimeout(poll, 50); })(); })`);
  check("after arriving, living light fades back in", relit === true, String(relit));
  await ev("S.owned = { plankton: 8, jelly: 4 }; syncCreatures(); 1");
  await sleep(1500);
  check("creatures far from any light show only their glowing parts", await ev(`(() => {
    creatures.forEach(c => { c.x = 20; c.y = play.h - 30; c.lit = 0; c.shown = false; c.links = 0; c.flash = 0; c.shiny = false; });
    return creatures.every(c => inDark(c)); })()`));

  // the trench: a vent charges the threads in its plume, and the way down is gated
  check("the trench has a vent and sells its natives", await ev(
    "ventList.length === 1 && shopSpecies().some(s => s.id === 'shrimp') && !shopSpecies().some(s => s.id === 'sponge')"));
  await ev("S.owned = { shrimp: 6, jelly: 4 }; creatures = []; links.clear(); syncCreatures(); 1");
  const vented = await ev(`new Promise(r => { const t0 = performance.now(); (function poll() {
      const v = ventList[0], a = creatures.find(c => c.s.id === "shrimp"), b = creatures.find(c => c.s.id === "jelly");
      a.x = v.px - 8; a.y = v.py; b.x = v.px + 8; b.y = v.py;
      if ([...links.values()].some(l => l.alive && l.vent)) return r(true);
      if (performance.now() - t0 > 4000) return r(JSON.stringify({ v, a: [a.x, a.y, a.born, a.links], b: [b.x, b.y, b.born, b.links],
        alive: [...links.values()].filter(l => l.alive).length, n: creatures.length, slow: tut.slow, d: descent.active }));
      setTimeout(poll, 30); })(); })`);
  check("a thread in a vent's plume is charged", vented === true, String(vented));
  await ev("S.allTime = 4e7; 1"); await sleep(200);
  check("the way down stays shut until the trench's gate is met",
    await ev("!gateMet() && !!ui.hot.find(h => h.id === 'gate') && !ui.hot.find(h => h.id === 'descend')"));
  await ev("S.gate = 60; 1"); await sleep(150);
  check("meeting the gate opens Descend", await ev("gateMet() && !!ui.hot.find(h => h.id === 'descend')"));

  // a tap while sinking skips to the bottom
  await clickHot("descend"); await sleep(50); await clickHot("m1"); await sleep(700);
  await clickAt(hx, hy); await sleep(100);
  check("a tap while sinking skips the descent", !(await ev("descent.active")) && (await ev("S.depth")) === 2,
    await ev("Z.name"));
  check("the gate starts over in the new zone", await ev("S.gate === 0 && Z.gate.kind === 'gulpers'"));

  // the plain: anchored sponges stay put and can be dragged
  await ev("S.owned = { plankton: 10, jelly: 6, sponge: 2 }; creatures = []; links.clear(); syncCreatures(); 1");
  await sleep(800);
  const sp0 = await ev("(() => { const c = creatures.find(c => c.s.id === 'sponge'); return [Math.round(c.x), Math.round(c.y)]; })()");
  await sleep(700);
  check("anchored creatures don't swim", await ev(`(() => { const c = creatures.find(c => c.s.id === 'sponge');
    return Math.round(c.x) === ${sp0[0]} && Math.round(c.y) === ${sp0[1]}; })()`));
  const to = [Math.round(await ev("play.cx")) - 50, Math.round(await ev("play.cy")) + 10];
  await mouse("mouseMoved", ...sp0); await mouse("mousePressed", ...sp0);
  for (let i = 1; i <= 5; i++) await mouse("mouseMoved", Math.round(sp0[0] + (to[0] - sp0[0]) * i / 5), Math.round(sp0[1] + (to[1] - sp0[1]) * i / 5));
  await mouse("mouseReleased", ...to); await sleep(100);
  check("dragging an anchor moves it, and it stays there", await ev(`(() => { const c = creatures.find(c => c.s.id === 'sponge');
    return Math.abs(c.x - ${to[0]}) < 3 && Math.abs(c.y - ${to[1]}) < 3 && S.mech.moved === 1 && !current.on; })()`));

  // a gulper eats a thread it crosses; three taps drive it off and count for the gate
  await sleep(1500);
  const bit = await ev(`(() => { const l = [...links.values()].find(l => l.alive);
    if (!l) return "no thread";
    const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
    l.a.born = l.b.born = 1; // hold still for a frame
    Object.assign(gulper, { on: true, x: mx - 22, y0: my, t: 0, vx: 0.001, hits: 0, flee: false, flash: 0 });
    updateGulper(0); return l.alive ? "still alive" : "cut"; })()`);
  check("a gulper's jaws cut the thread they cross", bit === "cut" && (await ev("S.mech.eaten")) >= 1, bit);
  for (let i = 0; i < 3; i++) {
    const [gx, gy] = await ev("[Math.round(gulper.x), Math.round(gulper.y)]");
    await clickAt(gx, gy);
  }
  check("three taps drive the gulper off, with a frenzy", await ev("gulper.flee && S.gate === 1 && now < frenzyUntil"),
    `gate ${await ev("S.gate")}`);

  // the Depth Log: mastering a zone pays black pearls, spent on the Abyssal Tree
  await ev("S.gate = 3; 1"); await sleep(300);
  check("meeting a gate pays 3 black pearls", await ev("S.black >= 3 && S.mech.gatePaid"), `${await ev("S.black")} black`);
  check("the Depth Log button appears", await ev("!!ui.hot.find(h => h.id === 'log')"));
  await clickHot("log");
  check("it opens the log", await ev("!!ui.log && S.logOpened"));
  const b0 = await ev("S.black");
  await clickHot("lg:n:w3");
  check("a node can't be bought before the one above it", await ev("!treeHas('w3')"));
  await clickHot("lg:n:w1");
  check("buying a tree node spends black pearls and applies it", await ev(`treeHas('w1') && S.black === ${b0} - 1`),
    `link x${(await ev("M.link / 0.035")).toFixed(3)}`);
  await clickHot("lg:tab:trials"); await sleep(50);
  check("tabs switch", await ev("ui.log.tab === 'trials'"));
  for (const t of ["secrets", "relics", "beasts"]) { await clickHot("lg:tab:" + t); await sleep(40); }
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape" });
  await sleep(50);
  check("Esc closes the log", !(await ev("ui.log")));

  // secrets: seven taps right on the beat make the heart wink, and it gives a relic
  check("seven on-beat taps find a secret and a relic, worn at once", await ev(`(() => {
    for (let i = 0; i < 7; i++) { heart.count = 500 + i; heart.beat = 0.05; onTap(); }
    return S.secrets.includes("wink") && S.equip.includes("bell") && M.beatRefill === 12; })()`));
  await clickHot("log"); await clickHot("lg:tab:relics"); await sleep(40);
  await clickHot("lg:r:bell"); await sleep(40);
  check("a relic can be taken off in the log", await ev("!S.equip.includes('bell') && M.beatRefill === 0"));
  await clickHot("lg:r:bell"); await sleep(40);
  check("and worn again", await ev("S.equip.includes('bell')"));
  await ev("closeLog(); 1"); await sleep(50);

  // a shiny creature: touch it to catalogue it
  const sh = await ev(`(() => { const c = creatures.find(c => !c.s.sessile && hasShiny(c.s));
    c.shiny = true; c.born = 1; return [Math.round(c.x), Math.round(c.y + bob(c))]; })()`);
  await ev(`creatures.forEach(c => { if (c.shiny) { c.vx = c.vy = 0; } }); 1`);
  await clickAt(...sh);
  check("touching a shiny catalogues it", await ev("S.secrets.includes('shiny') && relicHas('scale') && Object.values(S.best).some(b => b.shiny)"),
    await ev("S.secrets.join(',')"));
  check("a found relic waits in the log when every slot is full", await ev("relicHas('scale') && !S.equip.includes('scale')"));

  // trials, the bestiary and the night tide
  await ev("S.run.spores = 5; 1"); await sleep(200);
  check("a trial completes and pays", await ev("S.trials.includes('spores5')"), await ev("S.trials.join(',')"));
  check("the bestiary fills as creatures are seen", await ev("S.best.plankton.seen && S.best.gulper.seen && S.best.sponge.seen"));
  await ev("S.tideAt = -1e9; 1"); await sleep(200);
  check("a night tide darkens the water and counts as a secret", await ev(`(() => { if (!tide.on) return false;
    const a = curLight().ambient; tide.on = false; const b = curLight().ambient; tide.on = true;
    return a > b && S.secrets.includes("tide"); })()`));
  await ev("tide.on = false; 1");

  // past the authored zones: the Leviathan's Dream, generated from the save's seed
  const dream = await ev(`(() => { const a = zoneDef(9), b = zoneDef(9), c = zoneDef(10);
    return { stable: a.name === b.name && a.light.water === b.light.water, dream: a.dream, differ: a.name !== c.name || a.light.water !== c.light.water,
      deeper: c.depthM > a.depthM && a.depthM > ZONE_DEFS[5].depthM, name: a.name }; })()`);
  check("dream zones are stable for a save, deeper each time", dream.stable && dream.dream && dream.differ && dream.deeper, dream.name);
  // parallax: the scenery leans away from a hovering pointer, without pulling a current
  await mouse("mouseMoved", 12, Math.round(await ev("play.cy")));
  await ev(`new Promise(r => setTimeout(r, 1200))`);
  check("hovering the water tilts the backdrop and scenery, and pulls no current",
    await ev("view.x > 0.6 && bgShift()[0] > 2 && !current.on"), `view ${(await ev("view.x")).toFixed(2)}`);
  await ev("life.school = null; updateLife(30); life.nextGiant = 0; updateLife(0.1); 1"); await sleep(300);
  check("far life passes behind the reef", await ev("!!life.giant && scenery.length > 0"), await ev("scenery.length + ' props'"));
  check("numbers past decillions switch to exponents", await ev("fmt(1.5e40)") === "1.50e40", await ev("fmt(1.5e40)"));

  // the codex: ? opens it, tabs switch pages, SHOW ME replays a lesson, Esc closes
  await clickHot("help");
  check("? opens the codex", !!(await ev("ui.codex")));
  await clickHot("cx:current");
  check("tabs switch pages", (await ev("ui.codex.page")) === "current");
  check("reading a page clears its new mark", await ev("S.read.includes('current')"));
  await shot("screenshots/codex.png");
  await clickHot("cx:show");
  check("SHOW ME closes the book and replays the lesson",
    !(await ev("ui.codex")) && (await ev("tut.replay && tut.replay.id")) === "current");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "h", text: "h" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "h" });
  await sleep(50);
  check("H opens it", !!(await ev("ui.codex")));
  await clickHot("cx:hints");
  check("hints can be switched off", (await ev("S.hints")) === false && (await ev("tut.active")) === null);
  await clickHot("cx:hints");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape" });
  await sleep(50);
  check("Esc closes it", !(await ev("ui.codex")));

  // offline progress through a real reload
  await ev("S.owned = { plankton: 10, jelly: 5 }; S.res = 1.5; save(); " +
    "const d = JSON.parse(localStorage.getItem(SAVE_KEY)); d.t = Date.now() - 3600e3; " +
    "const put = () => localStorage.setItem(SAVE_KEY, JSON.stringify(d)); put(); " +
    "addEventListener('beforeunload', put); document.addEventListener('visibilitychange', put); 1");
  await send("Page.reload");
  await sleep(1800);
  const body = await ev("ui.modal ? ui.modal.body.join(' ') : ''");
  check("welcome-back dialog after 1h away", /1h 0m|59m/.test(body), body.replace(/\*/g, ""));
  await clickHot("m0");
  check("dialog closes", !(await ev("ui.modal")));
  check("save survived the reload", (await ev("S.depth")) === 2 && (await ev("S.owned.plankton")) === 10);
  check("the reloaded reef is back in its zone", await ev("Z.id === 'plain' && !!bgCanvas"));

  check("no JS errors", errors.length === 0, errors.join(" | "));
} catch (err) {
  console.error(err); failed++;
  if (errors.length) console.error("JS errors:\n  " + errors.join("\n  "));
} finally {
  ws?.close(); chrome.kill(); await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
