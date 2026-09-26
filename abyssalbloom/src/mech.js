/* Zone mechanics. Each zone adds one twist to the Resonance Web:
 *
 *   vents   (Midnight Trench) hydrothermal vents on the floor; threads in a
 *           vent's plume are charged, as in a held current, but for free.
 *   gulper  (Abyssal Plain) a shadow eel slides through and eats the threads it
 *           crosses; three taps drive it off and it drops a Bloom Frenzy.
 *   anchors (any zone with sessile natives) creatures that never swim: they sit
 *           where they are put, hold extra threads, and can be dragged.
 *
 * A zone's gate (Z.gate) has to be met before Descend opens; progress is S.gate.
 */
"use strict";

// ------------------------------------------------------------------ vents

// vents stand along the floor, spread out and clear of the middle
const VENT_X = [0.33, 0.76, 0.54];
const VENT_R = 34;
function vents() {
  if (Z.mechanic !== "vents") return [];
  const out = [];
  for (let i = 0; i < Math.min(M.vents, VENT_X.length); i++) {
    const x = Math.round(play.w * VENT_X[i]), floor = play.h - 6;
    // the plume: where threads are charged, a little above the mouth
    const r = VENT_R * M.ventR;
    out.push({ x, floor, px: x, py: floor - r * 0.9, r });
  }
  return out;
}
let ventList = [];

function inVent(a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return ventList.some(v => (mx - v.px) ** 2 + (my - v.py) ** 2 < v.r * v.r);
}

// warm water draws creatures in, the ones that love it most of all
function ventPull(c) {
  let tx = 0, ty = 0;
  for (const v of ventList) {
    const dx = v.px - c.x, dy = v.py - c.y, d = Math.hypot(dx, dy) || 1;
    const reach = v.r * (c.s.warm ? 4 : 2.2);
    if (d > reach || d < v.r * 0.4) continue;
    const f = (c.s.warm ? 14 : 6) * (1 - d / reach);
    tx += (dx / d) * f; ty += (dy / d) * f;
  }
  return [tx, ty];
}

const ventSparks = [];
function updateVents(dt) {
  ventList = vents();
  for (const v of ventList) {
    if (Math.random() < dt * 14) {
      ventSparks.push({ x: v.x + (Math.random() - 0.5) * 8, y: v.floor - 2, vx: (Math.random() - 0.5) * 4,
        vy: -12 - Math.random() * 14, life: 0, max: 1.5 + Math.random() * 1.5 });
    }
  }
  for (let i = ventSparks.length - 1; i >= 0; i--) {
    const p = ventSparks[i];
    p.life += dt; p.x += p.vx * dt + Math.sin(p.life * 5 + i) * 0.1; p.y += p.vy * dt;
    if (p.life > p.max) ventSparks.splice(i, 1);
  }
}

// heat haze and the mouth's glow; the sparks cycle from white-hot to ember
const EMBER = ["#fff3c8", "#ffc861", "#ff8a3a", "#c8402a"];
function drawVents() {
  for (const v of ventList) {
    ctx.fillStyle = ditherPattern(2 + (Math.floor(now * 6) % 2), "#ff8a3a");
    ctx.globalAlpha = 0.35;
    ctx.fillRect(v.x - 6, Math.round(v.py - v.r * 0.6), 12, Math.round(v.floor - v.py + v.r * 0.6));
    ctx.globalAlpha = 1;
    glow("#ff7a3a", v.x, v.floor - 4, 12 + (Math.floor(now * 4) % 2), 0.55);
    // the plume's reach, as a faint dotted ring that turns slowly
    ctx.globalAlpha = 0.25;
    ring(v.px, v.py, v.r, "#ff9a52", 4, Math.floor(now * 3));
    ctx.globalAlpha = 1;
  }
  for (const p of ventSparks) {
    const k = p.life / p.max;
    rect(Math.round(p.x), Math.round(p.y), 1, 1, EMBER[Math.min(3, Math.floor(k * 4))]);
  }
}

function ventLights(b) {
  for (const v of ventList) {
    addLight(v.x, v.floor - 4, 22 * b, 1.1);
    addLight(v.px, v.py, v.r * 0.9, 0.35);
  }
  for (const p of ventSparks) addLight(p.x, p.y, 3, 0.35);
}

// ---------------------------------------------------------------- anchors

// where a sessile creature settles: on a vent mouth, or a free spot on the floor
const anchorKey = c => c.s.id + ":" + c.slot;
function anchorSpot(c) {
  const s = c.s, saved = (S.mech.anchors || {})[anchorKey(c)];
  if (s.sessile === "vent") {
    const vs = vents(), n = c.slot;
    const v = vs[n % Math.max(1, vs.length)];
    if (v) return [v.x + ((n / vs.length) | 0) * 14 - 7, v.floor - s.size * 0.5];
  }
  if (saved) return [saved[0] * play.w, saved[1] * play.h];
  const x = play.w * (0.12 + Math.random() * 0.76);
  return [x, play.h - s.size * 0.5 - 6 - Math.random() * 30];
}

const isAnchored = c => !!c.s.sessile;
const linkCap = c => (isAnchored(c) ? M.maxLinks + M.anchorLinks : M.maxLinks);

// dragging an anchored creature to a new spot
let dragging = null;
function grabAnchor(x, y) {
  for (const c of creatures) {
    if (c.s.sessile !== "floor" || c.born < 1) continue;
    if (Math.hypot(c.x - x, c.y - y) < c.s.size * 0.6 + 4) { dragging = c; return true; }
  }
  return false;
}
function dragAnchor(x, y) {
  if (!dragging) return;
  dragging.x = dragging.hx = Math.max(10, Math.min(play.w - 10, x));
  dragging.y = dragging.hy = Math.max(play.top + 10, Math.min(play.h - 10, y));
}
function dropAnchor() {
  if (!dragging) return;
  const c = dragging;
  dragging = null;
  (S.mech.anchors = S.mech.anchors || {})[anchorKey(c)] = [c.x / play.w, c.y / play.h];
  S.mech.moved = (S.mech.moved || 0) + 1;
  burst(c.x, c.y, c.s.glow, 10, 30);
  chime(pent(6), 0.04, 1.2);
}

// ----------------------------------------------------------------- gulper

const gulper = { on: false, x: 0, y: 0, vx: 0, t: 0, hits: 0, flee: false, flash: 0, y0: 0 };
let gulperTimer = 45;
const cutPairs = new Map(); // pair key -> time the pair may link again

function updateGulper(dt) {
  if (Z.mechanic !== "gulper") { gulper.on = false; return; }
  const g = gulper;
  if (!g.on) {
    if ((gulperTimer -= dt) <= 0 && linkCount >= 4) {
      const left = Math.random() < 0.5;
      Object.assign(g, { on: true, x: left ? -50 : play.w + 50, vx: (left ? 1 : -1) * 20, t: 0, hits: 0,
        flee: false, flash: 0, y0: play.top + 30 + Math.random() * (play.h - play.top - 70), eatenAtStart: S.mech.eaten || 0 });
      chime(55, 0.08, 3, "triangle");
    }
    return;
  }
  g.t += dt; g.flash = Math.max(0, g.flash - dt * 3);
  g.x += g.vx * dt;
  g.y = g.y0 + Math.sin(g.t * 0.9) * 22;
  if (g.x < -80 || g.x > play.w + 80) { g.on = false; gulperTimer = 60 + Math.random() * 60; return; }
  if (g.flee) return;
  // the jaws cut any thread they pass through
  const hx = g.x + Math.sign(g.vx) * 22, hy = g.y;
  for (const [k, l] of links) {
    if (!l.alive) continue;
    if (segDist(hx, hy, l.a.x, l.a.y, l.b.x, l.b.y) < 5) {
      l.alive = false;
      cutPairs.set(k, now + 5);
      burst(hx, hy, "#3a1a40", 6, 30);
      S.mech.eaten = (S.mech.eaten || 0) + 1;
      if (++S.stats.eaten >= 50) findSecret("tooth");
      if (now - lastChime > 0.1) { lastChime = now; chime(pent(1), 0.05, 0.8, "triangle"); }
    }
  }
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// three taps (two with Lantern Lure) and it flees, leaving a frenzy behind
function tapGulper(x, y) {
  const g = gulper;
  if (!g.on || g.flee) return false;
  if (Math.abs(x - g.x) > 34 || Math.abs(y - g.y) > 14) return false;
  g.hits++; g.flash = 1;
  burst(x, y, "#ffffff", 8, 50);
  chime(pent(9 + g.hits), 0.06, 0.8);
  if (g.hits >= M.gulperTaps) {
    g.flee = true; g.vx = -g.vx * 3.5;
    S.gate = (S.gate || 0) + (Z.gate && Z.gate.kind === "gulpers" ? 1 : 0);
    S.mech.drivenOff = (S.mech.drivenOff || 0) + 1;
    frenzyUntil = now + M.frenzyT;
    if (S.mech.eaten === g.eatenAtStart) S.run.cleanGulper = true; // it never got a bite
    see("gulper");
    floatText(g.x, g.y - 12, "DRIVEN OFF  x7", C.gold, "caps");
    arpeggio([5, 7, 9, 12, 14], 0.05);
  }
  return true;
}

// a shadow eel: drawn after the light map, so it blots out the light it passes
function drawGulper() {
  const g = gulper;
  if (!g.on) return;
  const flip = g.vx < 0, spr = g.flash > 0.5 ? "gulper_f" : "gulper";
  if (!ATLAS.sprites[spr]) return;
  const [w, h] = spriteSize("gulper"), x = Math.round(g.x - w / 2), y = Math.round(g.y - h / 2);
  if (LT.ambient >= DARK_FROM && g.flash < 0.5) {
    if (flip) { ctx.save(); ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
    silhouette("gulper", x, y, "#010103");
    if (flip) ctx.restore();
    sprite("gulper_e", x, y, flip);
  } else sprite(spr, x, y, flip);
}

// ------------------------------------------------------------------- gate

// per-frame gate progress for gates that are about holding something
function updateGate(dt) {
  const gt = Z.gate;
  if (!gt || S.gate >= gt.need) return;
  if (gt.kind === "vents" && ventCharged >= 3) S.gate = Math.min(gt.need, (S.gate || 0) + dt);
}
const gateMet = () => !Z.gate || (S.gate || 0) >= Z.gate.need;

let ventCharged = 0; // threads charged by a vent this frame (set in updateLinks)

function updateMech(dt) {
  updateVents(dt);
  updateGulper(dt);
  updateGate(dt);
}
