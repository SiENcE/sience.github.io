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
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description);
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
  await sleep(600);
  await shot("screenshots/descent.png");
  await sleep(2400);
  check("descent grants pearls and depth", (await ev("S.pearls")) === 2 && (await ev("S.depth")) === 1);
  check("descent resets the reef", (await ev("Object.keys(S.owned).length")) === 0 && (await ev("S.lumen")) < 1);
  check("the dissolve finishes", !(await ev("descent.active")));

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
  check("save survived the reload", (await ev("S.depth")) === 1 && (await ev("S.owned.plankton")) === 10);

  check("no JS errors", errors.length === 0, errors.join(" | "));
} catch (err) {
  console.error(err); failed++;
} finally {
  ws?.close(); chrome.kill(); await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
