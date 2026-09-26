/* The reef: layout, creatures, threads, heart, current, spores and effects.
 * Simulation is ported from the HD game; drawing is pixel art — whole-pixel
 * positions, mirrored (never rotated) sprites, plotted threads, dithered light.
 */
"use strict";

// play = the open water; panel = the menu (right side, or bottom on portrait)
const play = { w: 0, h: 0, top: 0, cx: 0, cy: 0, crowd: 1 };
const panel = { x: 0, y: 0, w: 0, h: 0, portrait: false };
const PANEL_W = 152, HUD_H = 58;
let bgCanvas = null;

function layout() {
  panel.portrait = VH > VW;
  if (panel.portrait) {
    panel.h = Math.floor(VH * 0.48); panel.w = VW; panel.x = 0; panel.y = VH - panel.h;
    play.w = VW; play.h = panel.y;
  } else {
    panel.w = PANEL_W; panel.h = VH; panel.x = VW - PANEL_W; panel.y = 0;
    play.w = panel.x; play.h = VH;
  }
  play.top = HUD_H;
  play.cx = Math.round(play.w / 2);
  play.cy = Math.round(play.top + (play.h - play.top) * 0.47);
  // small reefs show fewer of each species so they don't turn into a wall
  play.crowd = Math.max(0.3, Math.min(1, (play.w * (play.h - play.top)) / (440 * 250)));
  buildBackground();
  placeProps();
}

// a zone's painted backdrop at whole-number scale (so the dithering stays square);
// zones without a painting of their own borrow the reef's, filtered
function makeBackdrop(z) {
  let img = IMG.bgs[z.bg], filter = z.tint || "";
  if (!img) { img = IMG.bgs.bg; filter = [z.fb, z.tint].filter(Boolean).join(" "); }
  if (!img) return null;
  const k = Math.max(1, Math.ceil(Math.max((play.w + 2 * BG_MARGIN) / img.width, (play.h + 2 * BG_MARGIN) / img.height)));
  const cv = document.createElement("canvas");
  cv.width = img.width * k; cv.height = img.height * k;
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  if (filter && "filter" in g) g.filter = filter;
  if (z.flip) { g.translate(cv.width, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}
function buildBackground() { bgCanvas = makeBackdrop(Z); bgLight = backdropLight(Z, bgCanvas); }

// what glows in the painting itself (vents, coral tips, a far shaft) keeps
// glowing in the dark: build_assets ships a coarse mask of its bright parts,
// sampled here into a fixed layer of the light map, lined up with the backdrop
let bgLight = null;
function backdropLight(z, cv) {
  const m = ATLAS.bglight && ATLAS.bglight[IMG.bgs[z.bg] ? z.bg : "bg"];
  if (!m || !cv) return null;
  if (!m.a) m.a = Uint8Array.from(atob(m.d), ch => ch.charCodeAt(0));
  const cell = cv.width / m.w, ox = Math.round(play.cx - cv.width / 2), oy = Math.round((play.h - cv.height) / 2);
  const hw = (VW + 1) >> 1, hh = (VH + 1) >> 1;
  const out = new Float32Array(hw * hh), at = (x, y) => m.a[y * m.w + x];
  for (let y = 0; y < hh; y++) {
    const fy = Math.max(0, Math.min(m.h - 1.001, (y * 2 + 1 - oy) / cell - 0.5)), y0 = fy | 0, ty = fy - y0;
    for (let x = 0; x < hw; x++) {
      let fx = Math.max(0, Math.min(m.w - 1.001, (x * 2 + 1 - ox) / cell - 0.5));
      if (z.flip) fx = m.w - 1.001 - fx;
      const x0 = fx | 0, tx = fx - x0;
      const v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
        (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
      out[y * hw + x] = (v / 255) * 1.1;
    }
  }
  return out;
}

// --------------------------------------------------------------- creatures

let creatures = [];
let uid = 0;

function spawnCreature(s, fromHeart) {
  const a = Math.random() * Math.PI * 2;
  const r = fromHeart ? 12 : (0.25 + Math.random() * 0.4) * Math.min(play.w, play.h - play.top);
  const c = {
    id: uid++, s, x: play.cx + Math.cos(a) * r, y: play.cy + Math.sin(a) * r * 0.7,
    vx: Math.cos(a) * (fromHeart ? 55 : 3), vy: Math.sin(a) * (fromHeart ? 55 : 3),
    th: a, phase: Math.random() * 10, flip: Math.cos(a) < 0,
    flash: fromHeart ? 1 : 0, born: fromHeart ? 0 : 1, links: 0, sepX: 0, sepY: 0, lit: 1, shown: true,
    // each keeps loosely to its own band around the heart and drifts along it
    orb: 0.3 + Math.random() * 0.5, dir: Math.random() < 0.5 ? -1 : 1,
  };
  c.y = Math.max(play.top + 10, Math.min(play.h - 24, c.y));
  c.slot = creatures.filter(o => o.s === s).length;
  c.shiny = hasShiny(s) && Math.random() < shinyChance();
  if (s.sessile) { [c.x, c.y] = anchorSpot(c); c.hx = c.x; c.hy = c.y; c.vx = c.vy = 0; }
  if (s.floor) c.y = play.h - 20 - Math.random() * 20;
  if (s.big) { c.y = play.cy + (Math.random() - 0.5) * (play.h - play.top) * 0.5; c.x = Math.random() < 0.5 ? -60 : play.w + 60; }
  creatures.push(c);
  if (fromHeart) burst(c.x, c.y, s.glow, 14, 50);
  return c;
}

function syncCreatures(fromHeart = false) {
  for (const s of SPECIES) {
    const want = Math.min(S.owned[s.id] || 0, Math.max(1, Math.round(s.cap * play.crowd)));
    const have = creatures.filter(c => c.s === s);
    for (let i = have.length; i < want; i++) spawnCreature(s, fromHeart);
    for (let i = want; i < have.length; i++) creatures.splice(creatures.indexOf(have[i]), 1);
  }
}

function separate() {
  for (const c of creatures) { c.sepX = 0; c.sepY = 0; }
  for (let i = 0; i < creatures.length; i++) {
    const a = creatures[i];
    for (let j = i + 1; j < creatures.length; j++) {
      const b = creatures[j];
      const min = (a.s.size + b.s.size) * 0.42;
      const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), f = (1 - d / min) / d;
      a.sepX += dx * f; a.sepY += dy * f; b.sepX -= dx * f; b.sepY -= dy * f;
    }
  }
}

function updateCreature(c, dt) {
  const s = c.s, sp = s.speed;
  c.phase += dt;
  c.born = Math.min(1, c.born + dt * 1.5);
  c.flash = Math.max(0, c.flash - dt * 1.8);
  c.th += (Math.random() - 0.5) * s.turn * dt * 6;
  if (s.sessile) { if (c !== dragging) { c.x = c.hx; c.y = c.hy; } return; }

  let tx = Math.cos(c.th) * sp, ty = Math.sin(c.th) * sp * 0.6;
  if (s.frames) { // jellies swim in pulses, rising on each contraction
    const p = Math.max(0, Math.sin(c.phase * 2.2));
    tx *= 0.4 + p * 1.2; ty = ty * 0.5 - p * sp * 0.9 + sp * 0.35;
  }
  const m = s.big ? -s.size * 0.2 : 16, pull = 30;
  if (c.x < m) tx += pull * (1 - c.x / m);
  if (c.x > play.w - m) tx -= pull * (1 - (play.w - c.x) / m);
  const top = play.top + 6;
  if (c.y < top) ty += pull * (1 + (top - c.y) / 20);
  if (c.y > play.h - 20) ty -= pull;

  const hx = c.x - play.cx, hy = c.y - play.cy, hd = Math.hypot(hx, hy) || 1;
  if (s.floor) ty += (play.h - 26 - c.y) * 0.8; // walks the silt
  else if (!s.big) {
    const nd = Math.hypot(hx / (play.w * 0.5), hy / ((play.h - play.top) * 0.5));
    const radial = Math.max(-1, Math.min(1, (nd - c.orb) * 3));
    tx += -(hx / hd) * radial * 15 + (-hy / hd) * c.dir * 5;
    ty += -(hy / hd) * radial * 15 + (hx / hd) * c.dir * 5;
  }
  const clear = HEART_R * 1.3 + s.size * 0.3;
  if (hd < clear) { tx += (hx / hd) * 40; ty += (hy / hd) * 40; }
  tx += c.sepX * 20; ty += c.sepY * 20;
  if (ventList.length) { const [vx, vy] = ventPull(c); tx += vx; ty += vy; }

  let k = 1.4;
  if (currentLive()) {
    const dx = current.x - c.x, dy = current.y - c.y, d = Math.hypot(dx, dy) || 1;
    if (d < CURRENT_R) {
      // drawn onto a slowly turning ring: close enough to thread up, spread enough to mingle
      const ringR = 18 + s.size * 0.5;
      const f = Math.min(1, (CURRENT_R - d) / 20) * 66 * M.pull;
      const radial = Math.max(-1, Math.min(1, (d - ringR) / 26));
      tx += (dx / d) * f * radial - (dy / d) * f * 0.45;
      ty += (dy / d) * f * radial + (dx / d) * f * 0.45;
      k = 3;
    }
  }
  c.vx += (tx - c.vx) * Math.min(1, k * dt);
  c.vy += (ty - c.vy) * Math.min(1, k * dt);
  c.x += c.vx * dt; c.y += c.vy * dt;
  // sprites face right; mirror with a little hysteresis so they don't flicker
  if (c.vx > 1.5) c.flip = false; else if (c.vx < -1.5) c.flip = true;
}

// ------------------------------------------------------------------ threads

const links = new Map(); // "a|b" -> { a, b, age, alive, fade, charged, spark }
let lastChime = 0;

const currentLive = () => current.on && current.energy > 0;
function inCurrent(a, b) {
  if (!currentLive()) return false;
  const mx = (a.x + b.x) / 2 - current.x, my = (a.y + b.y) / 2 - current.y;
  return mx * mx + my * my < CURRENT_R * CURRENT_R;
}

function updateLinks(dt) {
  const R = LINK_RANGE * M.range;
  for (const c of creatures) c.links = 0;
  // existing threads claim their slots first, with hysteresis, so the web is stable
  for (const l of links.values()) {
    if (!l.alive) continue;
    const { a, b } = l;
    if (!creatures.includes(a) || !creatures.includes(b)) { l.alive = false; continue; }
    const reach = R * 1.25 * (inCurrent(a, b) ? M.currentReach : 1);
    if (Math.hypot(a.x - b.x, a.y - b.y) < reach && a.links < linkCap(a) && b.links < linkCap(b)) {
      a.links++; b.links++;
    } else l.alive = false;
  }
  const n = creatures.length;
  for (let i = 0; i < n; i++) {
    const a = creatures[i];
    if (a.links >= linkCap(a) || a.born < 1) continue;
    for (let j = i + 1; j < n; j++) {
      const b = creatures[j];
      if (a.s === b.s || b.links >= linkCap(b) || b.born < 1) continue;
      const dx = a.x - b.x, dy = a.y - b.y, reach = inCurrent(a, b) ? R * M.currentReach : R;
      if (dx * dx + dy * dy > reach * reach) continue;
      const key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
      const l = links.get(key);
      if (l && l.alive) continue;
      if ((cutPairs.get(key) || 0) > now) continue; // a gulper bit this pair apart
      links.set(key, { a, b, age: 0, alive: true, fade: 1, spark: Math.random(), charged: false });
      a.links++; b.links++;
      burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#d8c8ff", 4, 18);
      tutOnThread(a, b);
      if (now - lastChime > 0.14) { lastChime = now; chime(pent(8 + ((Math.random() * 6) | 0)), 0.035, 1.6); }
      if (a.links >= linkCap(a)) break;
    }
  }
  linkCount = 0; charged = 0; ventCharged = 0;
  for (const [k, l] of links) {
    if (l.alive) {
      l.age += dt; linkCount++;
      // a held current or a vent's plume charges a thread
      l.vent = ventList.length > 0 && inVent(l.a, l.b);
      l.charged = inCurrent(l.a, l.b) || l.vent;
      if (l.charged) charged++;
      if (l.vent) ventCharged++;
    } else { l.fade -= dt * 2.5; if (l.fade <= 0) links.delete(k); }
  }
  // inside a held current, threads count double
  // a charged thread counts double (triple with the Gulper's Tooth)
  const target = 1 + M.link * Math.pow(linkCount + charged * (M.chargeMult - 1), M.resExp);
  resonance += (target - resonance) * Math.min(1, dt * 1.5);
}

// ------------------------------------------------------ heart, current, spore

const heart = { pulse: 0, beat: 0, rings: [], count: 0 };
const current = { on: false, x: 0, y: 0, energy: 100 };
let spore = null, sporeTimer = 30 + Math.random() * 30;

function updateHeart(dt) {
  heart.pulse = Math.max(0, heart.pulse - dt * 2.6);
  heart.beat += dt;
  if (heart.beat >= M.beat) {
    heart.beat -= M.beat; heart.count++;
    if (M.beatRefill) current.energy = Math.min(100, current.energy + M.beatRefill);
    heart.rings.push({ r: HEART_R * 0.9, life: 0, max: 3.5 });
    heart.pulse = Math.max(heart.pulse, 0.45);
    if (M.echo) tapHeart(true);
    chime(pent(0), 0.03, 2.4, "sine", 0.5);
  }
  for (const ring of heart.rings) {
    const prev = ring.r;
    ring.r += 80 * dt; ring.life += dt;
    for (const c of creatures) {
      const d = Math.hypot(c.x - play.cx, c.y - play.cy);
      if (d >= prev && d < ring.r) c.flash = Math.max(c.flash, 0.8);
    }
    // living specks in the snow answer the beat
    for (const p of snow) {
      if (!p.spark) continue;
      const d = Math.hypot(p.x - play.cx, p.y - play.cy);
      if (d >= prev && d < ring.r) p.lit = 1;
    }
    propRingHit(prev, ring.r);
  }
  heart.rings = heart.rings.filter(r => r.life < r.max);
}

function tapHeart(auto = false) {
  const v = clickValue();
  gain(v);
  heart.pulse = 1;
  if (!auto) {
    S.clicks++;
    onTap();
    // tap ripples are short, and only a few at a time, so drumming stays readable
    heart.rings.push({ r: HEART_R, life: 0, max: 1.1 });
    const oldest = heart.rings.findIndex(r => r.max < 2);
    if (heart.rings.length > 7 && oldest >= 0) heart.rings.splice(oldest, 1);
    chime(pent((Math.random() * 10) | 0), 0.06, 1.4);
    ui.hintGone = true;
  }
  floatText(play.cx + (Math.random() - 0.5) * 30, play.cy - HEART_R - 6, "+" + fmt(v), auto ? "#bfefff" : C.gold);
  for (let i = 0; i < (auto ? 1 : 2); i++) sendMote(play.cx + (Math.random() - 0.5) * 20, play.cy - 8);
  burst(play.cx, play.cy, auto ? "#8fe9ff" : "#fff1c2", auto ? 5 : 12, 60);
}

function updateSpore(dt) {
  if (!spore) {
    sporeTimer -= dt * M.sporeRate;
    if (sporeTimer <= 0 && S.total > 50) {
      const left = Math.random() < 0.5;
      spore = { x: left ? -12 : play.w + 12, y: play.top + (play.h - play.top) * (0.15 + Math.random() * 0.6),
        vx: (left ? 1 : -1) * (18 + Math.random() * 10), t: 0 };
    }
    return;
  }
  spore.t += dt;
  spore.x += spore.vx * dt * (spore.slow || 1);
  spore.y += Math.sin(spore.t * 1.3) * 7 * dt;
  if (spore.x < -20 || spore.x > play.w + 20) { spore = null; sporeTimer = 50 + Math.random() * 60; }
  else if (Math.random() < dt * 12) parts.push({ x: spore.x, y: spore.y, vx: -spore.vx * 0.2, vy: 3 - Math.random() * 6,
    life: 0, max: 1.2, size: 1, colour: C.gold });
}

function catchSpore() {
  const s = spore; spore = null; sporeTimer = 50 + Math.random() * 60;
  burst(s.x, s.y, C.gold, 30, 80);
  arpeggio([5, 7, 9, 12], 0.05);
  S.spores = (S.spores || 0) + 1;
  if (!s.practice) S.run.spores++;
  if (s.practice) { floatText(s.x, s.y - 8, "CAUGHT", C.gold, "caps"); return; }
  if (Math.random() < 0.55) {
    frenzyUntil = now + M.frenzyT;
    floatText(s.x, s.y - 8, "BLOOM FRENZY x7", C.gold, "caps");
  } else {
    const n = Math.max(25, rate() * 90) * M.sporeBurst;
    gain(n);
    floatText(s.x, s.y - 8, "+" + fmt(n), C.gold);
  }
}

// ------------------------------------------------------------------- motes

// little sparks of light that fly into a HUD element, so every gain has a visible
// destination; the HUD publishes where its pieces are each frame
const hudAnchor = { counter: [0, 0], res: [0, 0], rate: [0, 0, 0], meter: [0, 0] };
const motes = [];
function sendMote(x, y, to = "counter", colour = C.gold) {
  if (motes.length < 60) motes.push({ x0: x, y0: y, to, colour, t: 0, d: 0.5 + Math.random() * 0.3 });
}
function drawMotes(dt) {
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.t += dt / m.d;
    if (m.t >= 1) {
      motes.splice(i, 1);
      if (m.to === "res") ui.resBump = 0.12; else ui.counterBump = 0.08;
      continue;
    }
    const [tx, ty] = hudAnchor[m.to], e = m.t * m.t, u = 1 - e;
    // arc up and over, accelerating into the target
    const cx = m.x0 + (tx - m.x0) * 0.25, cy = Math.min(m.y0, ty) - 18;
    const x = u * u * m.x0 + 2 * u * e * cx + e * e * tx, y = u * u * m.y0 + 2 * u * e * cy + e * e * ty;
    rect(Math.round(x), Math.round(y), 2, 2, m.colour);
    rect(Math.round(x) + 1, Math.round(y), 1, 1, "#ffffff");
  }
}

// --------------------------------------------------------------- particles

const parts = [], texts = [], snow = [];
function burst(x, y, colour, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0,
      max: 0.5 + Math.random() * 0.8, size: Math.random() < 0.3 ? 2 : 1, colour });
  }
}
function floatText(x, y, str, colour = C.gold, font = "small", max = 1.3) {
  texts.push({ x, y, str, colour, font, life: 0, max });
}
function initSnow() {
  snow.length = 0;
  for (let i = 0; i < Math.round(VW * VH / 900); i++) {
    snow.push({ x: Math.random() * VW, y: Math.random() * VH, z: Math.random(), sway: Math.random() * 10, lit: 0 });
  }
  rollSparks();
}
// deeper water carries more living specks
function rollSparks() { for (const p of snow) p.spark = Math.random() < Z.light.sparks; }

// ------------------------------------------------------------------ drawing

const descent = { active: false, t: 0, done: false, cam: 0, p: 0, from: null, to: null,
  bgFrom: null, bgTo: null, arrive: 99 };
const lerp = (a, b, t) => a + (b - a) * t;
const DARK_FROM = 4; // below this darkness level the reef reads as fully lit
let LT = null;       // this frame's light: the zone's, blended while sinking

function curLight() {
  let l = Z.light;
  if (descent.active && descent.from) {
    const a = descent.from.light, b = descent.to.light, p = descent.p;
    // the band between zones stays a little readable: walls, strata, depth marks
    l = { ...(p < 0.5 ? a : b), sun: lerp(a.sun, b.sun, p),
      ambient: lerp(a.ambient, b.ambient, p) * (1 - 0.45 * Math.sin(p * Math.PI)),
      glowBoost: lerp(a.glowBoost, b.glowBoost, p) };
  }
  // a Bloom Frenzy lights up the whole water; a night tide darkens it
  if (now < frenzyUntil) l = { ...l, ambient: Math.max(0, l.ambient - 3) };
  if (tide.on) l = { ...l, ambient: Math.min(15, Math.max(l.ambient, 6) + 2), sun: l.sun * 0.3 };
  return l;
}

// the heart's halo comes in a few sizes only: a new big halo sprite is slow the
// first time it reaches the screen, and a smoothly changing radius (a pulse, the
// light blending while sinking) made one almost every frame
const heartHalo = (boost, pulse) => Math.round((pulse > 0.5 ? 64 : 58) * Math.round(Math.min(1.6, boost) * 4) / 4);
function prewarmHalos(z) {
  for (const p of [0, 1]) glowSprite("#55ccfb", heartHalo(z.light.glowBoost, p));
}

function drawWorld(dt) {
  LT = curLight();
  const lm = LT.ambient >= 1;
  updateCreatureLight(dt);
  drawBackdrop();
  const still = !descent.active; // scenery belongs to a zone; it isn't there while sinking
  if (still) { drawLife(lm); drawMidProps(); }

  ctx.globalCompositeOperation = "lighter";
  if (!lm) drawRays();
  drawSnow(dt, false);
  glow("#55ccfb", play.cx, play.cy, heartHalo(LT.glowBoost, heart.pulse), 0.22 + heart.pulse * 0.12);
  for (const r of heart.rings) {
    ctx.globalAlpha = Math.max(0, 0.6 * (1 - r.life / r.max));
    ring(play.cx, play.cy, r.r, "#8feaff", 2);
  }
  ctx.globalAlpha = 0.35;
  ring(play.cx, play.cy, HEART_R + 12, "#8feaff", 4, Math.floor(now * 6));
  ring(play.cx, play.cy, HEART_R + 18, "#c3a0ff", 5, 100 - Math.floor(now * 4));
  ctx.globalAlpha = 1;
  drawLinks();
  if (still) drawVents();
  ctx.globalCompositeOperation = "source-over";
  drawCreatures(lm);
  spriteC(heart.pulse > 0.5 ? "heart_f" : "heart", play.cx, play.cy);
  if (still) drawNearProps(lm);

  // the dark: everything above is only seen where living light reaches
  if (lm) {
    gatherLights();
    drawLightMap(LT.ambient, LT.dark);
    ctx.globalCompositeOperation = "lighter";
    drawRays();
    ctx.globalCompositeOperation = "source-over";
    drawEmissive();
    if (still) { drawPropGlow(); drawLifeGlow(); }
  }
  if (still) drawGulper();

  if (still) drawGrotto();
  ctx.globalCompositeOperation = "lighter";
  drawShinies();
  drawCurrent();
  drawSpore();
  drawParticles(dt);
  drawSnow(dt, true);
  ctx.globalCompositeOperation = "source-over";
  if (descent.active) drawDepthGauge();
  drawVignette();
  drawTexts(dt);
}

// --------------------------------------------------------------- backdrop

// the backdrop's offset from centre: a slow drift, plus the far layer of the parallax
const bgShift = () => [Math.round(Math.sin(now * 0.05) * 2 + view.x * PARALLAX.far),
  Math.round(Math.cos(now * 0.04) * 2 + view.y * PARALLAX.far)];

function drawBg(cv, dy) {
  if (!cv) return;
  const [sx, sy] = bgShift();
  const ox = Math.round(play.cx - cv.width / 2) + sx;
  const oy = Math.round((play.h - cv.height) / 2) + sy + dy;
  if (oy < play.h && oy + cv.height > 0) ctx.drawImage(cv, ox, oy);
}

// while sinking, the camera travels down a strip: the old zone, a band of rock
// and water, then the new zone rising into place; the heart sinks with you
const bandH = () => Math.round(play.h * 1.2);
function drawBackdrop() {
  const sinking = descent.active && descent.from;
  rect(0, 0, VW, VH, sinking ? descent.to.light.dark : "#06101e");
  if (!sinking) return drawBg(bgCanvas, 0);
  const cam = Math.round(descent.cam), B = bandH();
  drawBg(descent.bgFrom, -cam);
  drawBg(descent.bgTo, play.h + B - cam);
  drawBand(play.h - cam, B);
}

// the band is built once per descent, pixel by pixel into an ImageData (thousands
// of one-pixel canvas fills stalled the GPU for a whole frame), then scrolled as one image
function makeBand(from, to) {
  const B = bandH(), W = VW, cv = document.createElement("canvas");
  cv.width = W; cv.height = B;
  const g = cv.getContext("2d"), img = g.createImageData(W, B), u = new Uint32Array(img.data.buffer);
  const a = from.light, b = to.light, seed = to.depthM, R = play.w;
  const wa = rgbWord(a.water, 1), wb = rgbWord(b.water, 1), black = rgbWord("#000000", 1);
  const strata = ["#0a1322", "#0d182b", "#08101d"].map(c => rgbWord(c, 1)), seam = rgbWord("#1d2d48", 1);
  const edge = rgbWord("#24385a", 1), ledge = rgbWord("#3a5680", 1), speck = rgbWord(b.ray, 1);
  for (let y = 0; y < B; y++) {
    // the water shades from one zone to the next, darkest in the middle
    const f = (y & ~1) / B, mix = Math.round(f * 16), dark = Math.round(Math.sin(f * Math.PI) * 5), row = (y & 3) * 4;
    for (let x = 0; x < W; x++) {
      const t = BAYER[row + (x & 3)];
      u[y * W + x] = t < dark ? black : t < mix ? wb : wa;
    }
    // rock walls down both sides of the water, with strata, ledges and the odd living speck
    const stratum = Math.floor(y / 23) % 3;
    for (const side of [0, 1]) {
      const ph = seed * 0.001 + side * 2.1;
      let w = 22 + 10 * Math.sin(y * 0.043 + ph) + 6 * Math.sin(y * 0.13 + ph * 3) + ((y * 7 + side) % 3);
      const led = (y + side * 45) % 90;
      if (led < 14) w += (7 - Math.abs(led - 7)) * 5;
      w = Math.round(w);
      const x0 = side ? R - w : 0;
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        u[y * W + x] = y % 23 === 0 && BAYER[row + (x & 3)] < 8 ? seam : strata[stratum];
      }
      const ex = side ? R - w - 1 : w;
      if (ex >= 0 && ex < W) u[y * W + ex] = led < 14 && !side ? ledge : edge;
      if ((y * 31 + side * 17) % 61 === 0) {
        const sx = side ? R - w + 3 + (y % 5) : w - 4 - (y % 5);
        if (sx >= 0 && sx < W) u[y * W + sx] = speck;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function drawBand(y0, B) {
  if (y0 >= play.h || y0 + B <= 0) return;
  if (descent.band) ctx.drawImage(descent.band, 0, y0);
  // a thermocline shimmer a third of the way down, live because it flickers
  const ty = Math.round(y0 + B * 0.33);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ditherPattern(3 - i, "#6f9ec0");
    ctx.fillRect(0, ty + i * 3 + (Math.floor(now * 8) % 2), play.w, 2);
  }
}

// depth marks scroll past on the left while sinking
function drawDepthGauge() {
  const { from, to } = descent, span = play.h + bandH(), m0 = from.depthM, m1 = to.depthM;
  const yOf = m => Math.round(play.h / 2 + ((m - m0) / (m1 - m0)) * span - descent.cam);
  const step = m1 - m0 > 1500 ? 250 : 100;
  for (let m = Math.ceil((m0 - 400) / step) * step; m <= m1 + 400; m += step) {
    const y = yOf(m);
    if (y < 4 || y > play.h - 6) continue;
    const major = m % (step * 4) === 0;
    rect(4, y, major ? 7 : 4, 1, major ? C.dim : C.faint);
    if (major) text(m.toLocaleString() + " M", 13, y - 3, { colour: C.dim });
  }
}

// ------------------------------------------------------------------ light

// a creature is lit by the heart, its threads, a heartbeat or the current;
// unlit ones in dark water show only the glowing parts of their bodies
function updateCreatureLight(dt) {
  const R = 70 * LT.glowBoost;
  for (const c of creatures) {
    const hd = Math.hypot(c.x - play.cx, c.y - play.cy);
    let t = Math.max(0, 1.3 * (1 - hd / R)) + c.links * 0.34 + c.flash;
    if (currentLive() && Math.hypot(c.x - current.x, c.y - current.y) < CURRENT_R * 0.7) t += 0.4;
    c.lit += (Math.min(1, t) - c.lit) * Math.min(1, dt * 5);
    if (c.lit > 0.55) c.shown = true; else if (c.lit < 0.4) c.shown = false;
  }
}
const hasDark = c => !!ATLAS.sprites[c.s.spr + "_e"];
const inDark = c => LT.ambient >= DARK_FROM && !c.shown && !c.shiny && hasDark(c);

function gatherLights() {
  lightResize();
  const b = LT.glowBoost, f = lightMap.fade, hf = lightMap.heartFade;
  // start from the backdrop's own glow, moved with the backdrop
  lightBegin(descent.active ? null : bgLight, ...bgShift(), Math.max(f, 0.3));
  addLight(play.cx, play.cy, 62 * b + heart.pulse * 10, 1.3 * hf);
  for (const r of heart.rings) addRing(play.cx, play.cy, r.r, 3, 0.9 * (1 - r.life / r.max) * hf);
  for (const c of creatures) {
    const dark = inDark(c);
    addLight(c.x, c.y + bob(c), c.s.size * (dark ? 0.45 : 0.8) * b, (dark ? 0.4 : 0.5 + 0.5 * c.lit) * c.born * f);
  }
  for (const l of links.values()) {
    const g = linkGeom(l);
    if (!g) continue;
    addCurve(g.ax, g.ay, g.mx, g.my, g.bx, g.by, Math.round(4 * b), (l.charged ? 0.5 : 0.3) * g.k * f);
    addLight(g.qx, g.qy, 7 * b, 0.7 * g.k * f);
  }
  if (currentLive()) addLight(current.x, current.y, CURRENT_R * 0.45, 0.35 * Math.min(1, current.energy / 15));
  if (!descent.active) { propLights(b, Math.max(f, 0.4)); ventLights(b); }
  if (spore) addLight(spore.x, spore.y, 18 * b, 1.1);
  for (const p of parts) if (p.size > 1) addLight(p.x, p.y, 4, 0.5);
  for (const p of snow) if (p.lit > 0.05) addLight(p.x, p.y, 3, p.lit * 0.6);
}

function drawRays() {
  const n = Math.ceil(4 * LT.sun - 0.001), k = Math.min(1, LT.sun * 1.6);
  for (let i = 0; i < n; i++) {
    const x = play.w * (0.15 + i * 0.24) + Math.sin(now * 0.07 + i * 1.7) * 20;
    const w = 22 + 16 * Math.sin(i * 2.3 + now * 0.05);
    ctx.fillStyle = ditherPattern(3 + ((i + Math.floor(now * 0.5)) % 2), LT.ray);
    ctx.globalAlpha = (0.18 + 0.08 * Math.sin(now * 0.11 + i)) * k;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, 0); ctx.lineTo(x + w * 0.3, 0);
    ctx.lineTo(x + w * 1.6 + 40, VH); ctx.lineTo(x - w * 0.4 + 40, VH);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// back pass: dust behind the reef; front pass: near dust and the living sparks
function drawSnow(dt, front) {
  const sinking = descent.active && !descent.done;
  for (const p of snow) {
    const near = p.z >= 0.6;
    if (near === front) {
      p.y += (2 + p.z * 5) * dt * (sinking ? -25 : 1);
      p.x += Math.sin(now * 0.3 + p.sway) * 0.03;
      if (p.y > VH + 2) { p.y = -2; p.x = Math.random() * VW; }
      if (p.y < -12) { p.y = VH + 2; p.x = Math.random() * VW; }
    }
    if (front) p.lit = Math.max(0, p.lit - dt * 1.1);
    if (p.spark ? !front : near !== front) continue;
    if (p.spark && p.lit > 0.05) ctx.fillStyle = p.lit > 0.6 ? "#e8fdff" : LT.snow[1];
    else ctx.fillStyle = p.spark ? LT.snow[0] : near ? LT.snow[1] : LT.snow[0];
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, sinking ? 4 : 1);
  }
}

// ---------------------------------------------------------------- threads

// endpoints, bow and travelling mote of a thread, shared by drawing and light
function linkGeom(l) {
  const { a, b } = l;
  const k = Math.min(1, l.age / 0.5) * (l.alive ? 1 : Math.max(0, l.fade));
  if (k <= 0) return null;
  const ax = a.x, ay = a.y + bob(a), bx = b.x, by = b.y + bob(b);
  // bow the thread slightly so the web looks woven, not ruled
  const mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12;
  const t = (now * 0.5 + l.spark) % 1, u = 1 - t;
  const qx = u * u * ax + 2 * u * t * mx + t * t * bx, qy = u * u * ay + 2 * u * t * my + t * t * by;
  return { ax, ay, bx, by, mx, my, qx, qy, k };
}

// every thread is plotted into one pixel layer, then drawn (additively) in one go
function drawLinks() {
  if (!links.size) return;
  plotBegin();
  for (const l of links.values()) {
    const g = linkGeom(l);
    if (!g) continue;
    const ca = l.vent ? "#ff7a3a" : l.charged ? "#ffb347" : l.a.s.glow;
    const cb = l.vent ? "#ffb347" : l.charged ? "#ffd35c" : l.b.s.glow;
    const a = g.k * (l.charged ? 0.95 : 0.55 + 0.2 * Math.sin(now * 5 + l.spark * 20));
    plotCurve(g.ax, g.ay, g.mx, g.my, g.bx, g.by, rgbWord(ca, a), rgbWord(cb, a));
    // a mote of light travelling along the thread
    plotRect(Math.round(g.qx), Math.round(g.qy), 2, 2, rgbWord(l.charged ? "#fff1b0" : "#ffffff", g.k));
  }
  plotEnd();
}

// -------------------------------------------------------------- creatures

const bob = c => Math.round(Math.sin(c.phase * 1.6));

function baseFrame(c) {
  const s = c.s;
  return s.frames ? s.frames[Math.sin(c.phase * 2.2) > 0.25 ? 1 : 0] : s.spr;
}
function creatureSprite(c) {
  const name = baseFrame(c);
  if (c.shiny) return name + "_s";
  const twinkle = c.s.twinkle && Math.sin(c.phase * 3 + c.id) > 0.93;
  return c.flash > 0.45 || twinkle ? name + "_f" : name;
}

// big creatures first, so the small ones glitter on top
let drawOrder = [];
function drawCreatures(lm) {
  drawOrder = creatures.slice().sort((a, b) => b.s.index - a.s.index);
  ctx.globalCompositeOperation = "lighter";
  for (const c of drawOrder) {
    glow(c.s.glow, c.x, c.y + bob(c), c.s.size * (c.s.big ? 0.45 : 0.75),
      (0.22 + c.flash * 0.3 + c.links * 0.06) * c.born * (lm && inDark(c) ? 0.4 : 1));
  }
  ctx.globalCompositeOperation = "source-over";
  for (const c of drawOrder) {
    if (c.born < 0.3) continue;
    ctx.globalAlpha = Math.ceil(c.born * 4) / 4; // stepped fade-in
    spriteC(lm && inDark(c) ? baseFrame(c) + "_d" : creatureSprite(c), c.x, c.y + bob(c), c.flip);
  }
  ctx.globalAlpha = 1;
}

// a shiny glints now and then, so a sharp eye can spot it in a crowd
function drawShinies() {
  for (const c of creatures) {
    if (!c.shiny || c.born < 1) continue;
    const k = Math.floor(now * 6 + c.id) % 12;
    if (k > 2) continue;
    const x = Math.round(c.x + ((c.id * 7) % 9) - 4), y = Math.round(c.y + bob(c) - c.s.size * 0.4);
    rect(x, y - k, 1, 1 + k * 2, "#ffffff"); rect(x - k, y, 1 + k * 2, 1, "#ffffff");
  }
}

// over the dark: the lures, spots and rims of creatures no light reaches
function drawEmissive() {
  for (const c of drawOrder) {
    if (c.born < 0.3 || !inDark(c)) continue;
    ctx.globalAlpha = Math.ceil(c.born * 4) / 4;
    spriteC(baseFrame(c) + "_e", c.x, c.y + bob(c), c.flip);
  }
  ctx.globalAlpha = 1;
}

function arcDots(cx, cy, r, a0, a1, colour) {
  ctx.fillStyle = colour;
  const n = Math.max(4, Math.round(r * (a1 - a0)));
  for (let i = 0; i <= n; i += 2) {
    const a = a0 + ((a1 - a0) * i) / n;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

function drawCurrent() {
  if (!currentLive()) return;
  const fade = Math.min(1, current.energy / 15);
  glow("#4fd8ff", current.x, current.y, CURRENT_R * 0.55, 0.14 * fade);
  for (let i = 0; i < 4; i++) {
    const r = CURRENT_R * (0.22 + i * 0.18), a0 = now * (2.4 - i * 0.35) + i * 1.3;
    ctx.globalAlpha = (0.9 - i * 0.15) * fade;
    const col = i % 2 ? C.gold : "#8feaff";
    arcDots(current.x, current.y, r, a0, a0 + 1.5, col);
    arcDots(current.x, current.y, r, a0 + Math.PI, a0 + Math.PI + 1, col);
  }
  ctx.globalAlpha = 1;
}

function drawSpore() {
  if (!spore) return;
  glow("#ffc760", spore.x, spore.y, 14 + (Math.sin(spore.t * 4) > 0 ? 1 : 0), 0.5);
  ctx.globalCompositeOperation = "source-over";
  spriteC("spore", spore.x, spore.y + Math.round(Math.sin(spore.t * 3)));
  ctx.globalCompositeOperation = "lighter";
}

function drawParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2; p.vy -= 3 * dt;
    ctx.globalAlpha = p.life / p.max > 0.6 ? 0.5 : 1;
    rect(Math.round(p.x), Math.round(p.y), p.size, p.size, p.colour);
  }
  ctx.globalAlpha = 1;
}

// dithered dark border instead of a smooth vignette; deeper zones close in
const VIGNETTES = [[9, 5, 2], [12, 9, 5, 2], [14, 11, 8, 5, 2], [15, 13, 11, 8, 5, 2]];
function drawVignette() {
  VIGNETTES[Math.min(3, LT.vignette | 0)].forEach((level, i) => {
    ctx.fillStyle = ditherPattern(level, "#02050b");
    const o = i * 3;
    ctx.fillRect(o, o, VW - o * 2, 3);
    ctx.fillRect(o, VH - o - 3, VW - o * 2, 3);
    ctx.fillRect(o, o + 3, 3, VH - o * 2 - 6);
    ctx.fillRect(VW - o - 3, o + 3, 3, VH - o * 2 - 6);
  });
}

function drawTexts(dt) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life += dt;
    if (t.life > t.max) { texts.splice(i, 1); continue; }
    const k = t.life / t.max;
    if (k > 0.75 && Math.floor(t.life * 20) % 2) continue; // blink out
    text(t.str, t.x, t.y - k * 18, { font: t.font, colour: t.colour, align: "center" });
  }
}
