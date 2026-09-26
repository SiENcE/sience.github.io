/* Boot, main loop, descent and offline progress. */
"use strict";

// ---------------------------------------------------------------- descent

const FLEE = 0.5, SINK = 2.8; // seconds: creatures scatter upward, then the camera sinks

async function askDescend() {
  const pa = pearlsAvailable();
  if (pa < 1 || !gateMet()) return;
  const next = zoneDef(S.depth + 1);
  const ok = await modal("Descend?", [
    `Release your reef and sink to *${next.name}*, *${next.depthM.toLocaleString()} m* down.`,
    `You keep *${S.pearls + pa} pearls* - everything down there shines *+${Math.round((S.pearls + pa) * M.pearlPct * 100)}%* brighter.`,
  ], "Descend", "Stay");
  if (!ok || descent.active) return;
  prewarmHalos(next);
  Object.assign(descent, { active: true, t: 0, done: false, cam: 0, p: 0, from: Z, to: next,
    bgFrom: bgCanvas, bgTo: makeBackdrop(next), band: makeBand(Z, next) });
  for (const c of creatures) c.vy = -200 - Math.random() * 150;
  chime(55, 0.12, 4, "sine"); chime(82.4, 0.08, 4, "triangle", 0.2);
}

function finishDescent() {
  const pa = pearlsAvailable();
  S.pearls += pa; S.depth++;
  S.lumen = 0; S.total = 0; S.owned = {}; S.upg = [];
  S.gate = 0; S.mech = {}; gulper.on = false; cutPairs.clear();
  rebuildMods(); creatures = []; links.clear(); resonance = 1; frenzyUntil = 0;
  setZone(); startDive(); bgCanvas = descent.bgTo; bgLight = backdropLight(Z, bgCanvas); placeProps(); rollSparks(); setDrone(Z);
  save();
}

// the camera sinks past the old zone, a band of rock and water, and into the
// new one; living light fades on the way down and the heart relights first
function updateDescent(dt) {
  descent.t += dt;
  const s = Math.max(0, Math.min(1, (descent.t - FLEE) / SINK));
  const e = s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s);
  descent.p = e; descent.cam = e * (play.h + bandH());
  lightMap.fade = Math.max(0, 1 - e * 1.6);
  lightMap.heartFade = 1 - e * 0.75;
  if (!descent.done && descent.cam >= play.h) { descent.done = true; finishDescent(); }
  if (s >= 1) arrive();
}

function arrive() {
  if (!descent.done) { descent.done = true; finishDescent(); }
  descent.active = false; descent.arrive = 0;
  lightMap.fade = 0; lightMap.heartFade = 0.25;
  floatText(play.cx, play.cy - HEART_R - 22, Z.name, C.violet, "big", 3.2);
  if (Z.dream) floatText(play.cx, play.cy - HEART_R - 6, "THE LEVIATHAN'S DREAM", C.dim, "caps", 3.2);
  arpeggio([0, 4, 7, 9, 12], 0.05);
}

// after arriving, the heart lights up first and the rest of the reef follows
function updateArrival(dt) {
  if (descent.arrive > 3) return;
  const t = (descent.arrive += dt);
  lightMap.heartFade = Math.min(1, 0.25 + t / 0.9);
  lightMap.fade = Math.max(0, Math.min(1, (t - 0.5) / 1.4));
}

// a tap while sinking skips straight to the bottom
function skipDescent() { if (descent.active) { descent.p = 1; arrive(); } }

// ------------------------------------------------------------------- loop

let last = performance.now(), saveTimer = 5;
function frame(t) {
  const real = Math.min(0.05, (t - last) / 1000);
  last = t;
  now += real;

  tutUpdate(real);
  if (descent.active) updateDescent(real); else updateArrival(real);
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
  updateProps(real);
  updateMech(real);
  updateMeta(real);
  const drain = M.eternal && now < frenzyUntil ? 0 : M.drain;
  if (current.on) current.energy = Math.max(0, current.energy - drain * real);
  else current.energy = Math.min(100, current.energy + M.refill * real);

  drawWorld(sim);
  drawUI(real);
  drawMotes(real);
  drawTutorial();
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
  rebuildMods(); setZone();
  // and the zone's own natives, so a showcase of a zone looks like that zone
  for (const s of SPECIES) if (s.zone === Z.id) S.owned[s.id] = Math.ceil(s.cap / 2);
}

async function boot() {
  // every zone backdrop that build_assets made, so descending never waits on a load
  const bgs = ATLAS.bgs || ["bg"];
  const imgs = await Promise.all([loadImage("assets/atlas.png"), ...bgs.map(b => loadImage(`assets/${b}.png`))]);
  IMG.atlas = imgs[0];
  bgs.forEach((b, i) => { if (imgs[i + 1]) IMG.bgs[b] = imgs[i + 1]; });
  IMG.bg = IMG.bgs.bg;
  if (params.has("demo")) demoState();
  rebuildMods(); // now that the tree and relics are known
  syncCreatures();
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
  const away = Math.min(M.offline, (Date.now() - S.t) / 1000);
  if (away > 60 && baseRate() > 0) {
    const earned = baseRate() * (S.res || 1) * away;
    gain(earned);
    modal("Welcome back", [`While you drifted for *${fmtTime(away)}*, your creatures gathered *${fmt(earned)} lumen*.`],
      "Dive in");
  }
}

boot();
