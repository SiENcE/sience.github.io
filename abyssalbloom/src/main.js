/* Boot, main loop, descent and offline progress. */
"use strict";

// ---------------------------------------------------------------- descent

async function askDescend() {
  const pa = pearlsAvailable();
  if (pa < 1) return;
  const next = ZONES[Math.min(S.depth + 1, ZONES.length - 1)];
  const ok = await modal("Descend?", [
    `Release your reef and sink to *${next}*.`,
    `You keep *${S.pearls + pa} pearls* - everything down there shines *+${(S.pearls + pa) * 10}%* brighter.`,
  ], "Descend", "Stay");
  if (!ok || descent.active) return;
  descent.active = true; descent.t = 0; descent.done = false;
  for (const c of creatures) c.vy = -200 - Math.random() * 150;
  chime(55, 0.12, 4, "sine"); chime(82.4, 0.08, 4, "triangle", 0.2);
}

function finishDescent() {
  const pa = pearlsAvailable();
  S.pearls += pa; S.depth++;
  S.lumen = 0; S.total = 0; S.owned = {}; S.upg = [];
  rebuildMods(); creatures = []; links.clear(); resonance = 1; frenzyUntil = 0;
  buildBackground(); save();
  floatText(play.cx, play.cy - HEART_R - 14, ZONES[Math.min(S.depth, ZONES.length - 1)].toUpperCase(), C.violet, "caps");
  arpeggio([0, 4, 7, 9, 12], 0.05);
}

// a Bayer dissolve to black and back: 1.2s down, swap the reef, 1s up
function drawDescent(dt) {
  descent.t += dt;
  let k;
  if (descent.t < 1.2) k = descent.t / 1.2;
  else {
    if (!descent.done) { descent.done = true; finishDescent(); }
    k = 1 - (descent.t - 1.4) / 1;
    if (k <= 0) { descent.active = false; return; }
  }
  const level = Math.max(0, Math.min(16, Math.round(k * 16)));
  if (level) { ctx.fillStyle = ditherPattern(level, "#000000"); ctx.fillRect(0, 0, VW, VH); }
}

// ------------------------------------------------------------------- loop

let last = performance.now(), saveTimer = 5;
function frame(t) {
  const real = Math.min(0.05, (t - last) / 1000);
  last = t;
  now += real;

  tutUpdate(real);
  const sim = real * tut.slow; // the first thread plays in slow motion
  if (!descent.active || descent.done) {
    separate();
    for (const c of creatures) updateCreature(c, sim);
    updateLinks(sim);
    gain(rate() * real * TIME_SCALE);
  } else {
    for (const c of creatures) { c.y += c.vy * real; c.born = Math.max(0, c.born - real); }
  }
  updateHeart(real);
  updateSpore(real);
  if (current.on) current.energy = Math.max(0, current.energy - M.drain * real);
  else current.energy = Math.min(100, current.energy + 9 * real);

  drawWorld(sim);
  drawUI(real);
  drawMotes(real);
  drawTutorial();
  if (descent.active) drawDescent(real);
  drawOverlays();

  saveTimer -= real;
  if (saveTimer <= 0) { saveTimer = 5; S.res = resonance; save(); }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------- boot

// ?demo — a mid-game reef, for screenshots; ?demo=3 starts three zones down
function demoState() {
  S = freshState();
  Object.assign(S.owned, { plankton: 40, jelly: 16, seahorse: 11, angler: 8, nautilus: 5, manta: 3, leviathan: 1 });
  S.upg = ["tendrils", "threads", "current", "reach", "echo", "plankton2", "jelly2"];
  S.lumen = 3.2e7; S.total = 6e7; S.allTime = 8e7; S.pearls = 3; S.depth = +params.get("demo") || 0;
  S.t = Date.now();
  rebuildMods();
}

async function boot() {
  [IMG.atlas, IMG.bg] = await Promise.all([loadImage("assets/atlas.png"), loadImage("assets/bg.png")]);
  if (params.has("demo")) demoState();
  tutInit();
  const relayout = () => { fitScreen(); layout(); initSnow(); syncCreatures(); };
  relayout();
  resonance = S.res || 1;
  addEventListener("resize", () => {
    const ow = play.w, oh = play.h;
    relayout();
    // keep the reef's shape instead of stranding creatures off-screen
    for (const c of creatures) { c.x *= play.w / ow; c.y *= play.h / oh; }
  });
  addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
  requestAnimationFrame(t => { last = t; frame(t); });

  // offline progress: the reef keeps glowing while you are away
  const away = Math.min(8 * 3600, (Date.now() - S.t) / 1000);
  if (away > 60 && baseRate() > 0) {
    const earned = baseRate() * (S.res || 1) * away;
    gain(earned);
    modal("Welcome back", [`While you drifted for *${fmtTime(away)}*, your creatures gathered *${fmt(earned)} lumen*.`],
      "Dive in");
  }
}

boot();
