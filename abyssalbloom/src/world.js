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
}

function buildBackground() {
  if (!IMG.bg) return;
  // whole-number scale only, so the dithering stays square
  const k = Math.max(1, Math.ceil(Math.max((VW + 16) / IMG.bg.width, (VH + 16) / IMG.bg.height)));
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = IMG.bg.width * k; bgCanvas.height = IMG.bg.height * k;
  const g = bgCanvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  // each dive shifts the water towards violet and darker
  const d = Math.min(S.depth, ZONES.length - 1);
  if (d && "filter" in g) g.filter = `hue-rotate(${d * 28}deg) brightness(${1 - d * 0.08})`;
  g.drawImage(IMG.bg, 0, 0, bgCanvas.width, bgCanvas.height);
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
    flash: fromHeart ? 1 : 0, born: fromHeart ? 0 : 1, links: 0, sepX: 0, sepY: 0,
    // each keeps loosely to its own band around the heart and drifts along it
    orb: 0.3 + Math.random() * 0.5, dir: Math.random() < 0.5 ? -1 : 1,
  };
  c.y = Math.max(play.top + 10, Math.min(play.h - 24, c.y));
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
  if (!s.big) {
    const nd = Math.hypot(hx / (play.w * 0.5), hy / ((play.h - play.top) * 0.5));
    const radial = Math.max(-1, Math.min(1, (nd - c.orb) * 3));
    tx += -(hx / hd) * radial * 15 + (-hy / hd) * c.dir * 5;
    ty += -(hy / hd) * radial * 15 + (hx / hd) * c.dir * 5;
  }
  const clear = HEART_R * 1.3 + s.size * 0.3;
  if (hd < clear) { tx += (hx / hd) * 40; ty += (hy / hd) * 40; }
  tx += c.sepX * 20; ty += c.sepY * 20;

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
    const reach = R * 1.25 * (inCurrent(a, b) ? 1.4 : 1);
    if (Math.hypot(a.x - b.x, a.y - b.y) < reach && a.links < M.maxLinks && b.links < M.maxLinks) {
      a.links++; b.links++;
    } else l.alive = false;
  }
  const n = creatures.length;
  for (let i = 0; i < n; i++) {
    const a = creatures[i];
    if (a.links >= M.maxLinks || a.born < 1) continue;
    for (let j = i + 1; j < n; j++) {
      const b = creatures[j];
      if (a.s === b.s || b.links >= M.maxLinks || b.born < 1) continue;
      const dx = a.x - b.x, dy = a.y - b.y, reach = inCurrent(a, b) ? R * 1.4 : R;
      if (dx * dx + dy * dy > reach * reach) continue;
      const key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
      const l = links.get(key);
      if (l && l.alive) continue;
      links.set(key, { a, b, age: 0, alive: true, fade: 1, spark: Math.random(), charged: false });
      a.links++; b.links++;
      burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#d8c8ff", 4, 18);
      tutOnThread(a, b);
      if (now - lastChime > 0.14) { lastChime = now; chime(pent(8 + ((Math.random() * 6) | 0)), 0.035, 1.6); }
      if (a.links >= M.maxLinks) break;
    }
  }
  linkCount = 0; charged = 0;
  for (const [k, l] of links) {
    if (l.alive) {
      l.age += dt; linkCount++;
      l.charged = inCurrent(l.a, l.b);
      if (l.charged) charged++;
    } else { l.fade -= dt * 2.5; if (l.fade <= 0) links.delete(k); }
  }
  // inside a held current, threads count double
  const target = 1 + M.link * Math.pow(linkCount + charged, 0.85);
  resonance += (target - resonance) * Math.min(1, dt * 1.5);
}

// ------------------------------------------------------ heart, current, spore

const heart = { pulse: 0, beat: 0, rings: [] };
const current = { on: false, x: 0, y: 0, energy: 100 };
let spore = null, sporeTimer = 30 + Math.random() * 30;

function updateHeart(dt) {
  heart.pulse = Math.max(0, heart.pulse - dt * 2.6);
  heart.beat += dt;
  if (heart.beat >= BEAT) {
    heart.beat -= BEAT;
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
  }
  heart.rings = heart.rings.filter(r => r.life < r.max);
}

function tapHeart(auto = false) {
  const v = clickValue();
  gain(v);
  heart.pulse = 1;
  if (!auto) {
    S.clicks++;
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
  if (s.practice) { floatText(s.x, s.y - 8, "CAUGHT", C.gold, "caps"); return; }
  if (Math.random() < 0.55) {
    frenzyUntil = now + 20;
    floatText(s.x, s.y - 8, "BLOOM FRENZY x7", C.gold, "caps");
  } else {
    const n = Math.max(25, rate() * 90);
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
function floatText(x, y, str, colour = C.gold, font = "small") {
  texts.push({ x, y, str, colour, font, life: 0, max: 1.3 });
}
function initSnow() {
  snow.length = 0;
  for (let i = 0; i < Math.round(VW * VH / 900); i++) {
    snow.push({ x: Math.random() * VW, y: Math.random() * VH, z: Math.random(), sway: Math.random() * 10 });
  }
}

// ------------------------------------------------------------------ drawing

const descent = { active: false, t: 0 };

function drawWorld(dt) {
  // backdrop, whole-pixel parallax only
  if (bgCanvas) {
    const ox = Math.round(play.cx - bgCanvas.width / 2 + Math.sin(now * 0.05) * 3);
    const oy = Math.round((VH - bgCanvas.height) / 2 + Math.cos(now * 0.04) * 2);
    ctx.drawImage(bgCanvas, ox, oy);
  } else rect(0, 0, VW, VH, "#06101e");

  ctx.globalCompositeOperation = "lighter";
  drawRays();
  drawSnow(dt, 0, 0.6);
  glow("#55ccfb", play.cx, play.cy, 58 + heart.pulse * 6, 0.22 + heart.pulse * 0.12);
  for (const r of heart.rings) {
    ctx.globalAlpha = Math.max(0, 0.6 * (1 - r.life / r.max));
    ring(play.cx, play.cy, r.r, "#8feaff", 2);
  }
  ctx.globalAlpha = 0.35;
  ring(play.cx, play.cy, HEART_R + 12, "#8feaff", 4, Math.floor(now * 6));
  ring(play.cx, play.cy, HEART_R + 18, "#c3a0ff", 5, 100 - Math.floor(now * 4));
  ctx.globalAlpha = 1;
  drawLinks();
  ctx.globalCompositeOperation = "source-over";
  drawCreatures();
  spriteC(heart.pulse > 0.5 ? "heart_f" : "heart", play.cx, play.cy);
  ctx.globalCompositeOperation = "lighter";
  drawCurrent();
  drawSpore();
  drawParticles(dt);
  drawSnow(dt, 0.6, 1.01);
  ctx.globalCompositeOperation = "source-over";
  drawVignette();
  drawTexts(dt);
}

function drawRays() {
  for (let i = 0; i < 4; i++) {
    const x = play.w * (0.15 + i * 0.24) + Math.sin(now * 0.07 + i * 1.7) * 20;
    const w = 22 + 16 * Math.sin(i * 2.3 + now * 0.05);
    ctx.fillStyle = ditherPattern(3 + ((i + Math.floor(now * 0.5)) % 2), "#6fd8ff");
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(now * 0.11 + i);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, 0); ctx.lineTo(x + w * 0.3, 0);
    ctx.lineTo(x + w * 1.6 + 40, VH); ctx.lineTo(x - w * 0.4 + 40, VH);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSnow(dt, z0, z1) {
  for (const p of snow) {
    if (p.z < z0 || p.z >= z1) continue;
    p.y += (2 + p.z * 5) * dt * (descent.active ? -25 : 1);
    p.x += Math.sin(now * 0.3 + p.sway) * 0.03;
    if (p.y > VH + 2) { p.y = -2; p.x = Math.random() * VW; }
    if (p.y < -12) { p.y = VH + 2; p.x = Math.random() * VW; }
    ctx.fillStyle = p.z > 0.8 ? "#9fd6ee" : "#4f8aa6";
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, descent.active ? 4 : 1);
  }
}

function drawLinks() {
  for (const l of links.values()) {
    const { a, b } = l;
    const k = Math.min(1, l.age / 0.5) * (l.alive ? 1 : Math.max(0, l.fade));
    if (k <= 0) continue;
    const ca = l.charged ? "#ffb347" : a.s.glow, cb = l.charged ? "#ffd35c" : b.s.glow;
    const ax = a.x, ay = a.y + bob(a), bx = b.x, by = b.y + bob(b);
    // bow the thread slightly so the web looks woven, not ruled
    const mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12;
    ctx.globalAlpha = k * (l.charged ? 0.95 : 0.55 + 0.2 * Math.sin(now * 5 + l.spark * 20));
    curve(ax, ay, mx, my, bx, by, ca, cb);
    // a mote of light travelling along the thread
    const t = (now * 0.5 + l.spark) % 1, u = 1 - t;
    const qx = u * u * ax + 2 * u * t * mx + t * t * bx, qy = u * u * ay + 2 * u * t * my + t * t * by;
    ctx.globalAlpha = k;
    rect(Math.round(qx), Math.round(qy), 2, 2, l.charged ? "#fff1b0" : "#ffffff");
  }
  ctx.globalAlpha = 1;
}

const bob = c => Math.round(Math.sin(c.phase * 1.6));

function creatureSprite(c) {
  const s = c.s;
  let name = s.spr;
  if (s.frames) name = s.frames[Math.sin(c.phase * 2.2) > 0.25 ? 1 : 0];
  const twinkle = s.twinkle && Math.sin(c.phase * 3 + c.id) > 0.93;
  return c.flash > 0.45 || twinkle ? name + "_f" : name;
}

function drawCreatures() {
  // big creatures first, so the small ones glitter on top
  const order = creatures.slice().sort((a, b) => b.s.index - a.s.index);
  ctx.globalCompositeOperation = "lighter";
  for (const c of order) {
    glow(c.s.glow, c.x, c.y + bob(c), c.s.size * (c.s.big ? 0.45 : 0.75),
      (0.22 + c.flash * 0.3 + c.links * 0.06) * c.born);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const c of order) {
    if (c.born < 0.3) continue;
    ctx.globalAlpha = Math.ceil(c.born * 4) / 4; // stepped fade-in
    spriteC(creatureSprite(c), c.x, c.y + bob(c), c.flip);
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

// dithered dark border instead of a smooth vignette
function drawVignette() {
  [9, 5, 2].forEach((level, i) => {
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
