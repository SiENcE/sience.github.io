/* Scenery: the parallax layers in front of the painted backdrop, and the life
 * that passes far behind the reef.
 *
 *   mid   silhouettes (spires, arches, bones) tinted with the zone's fog colour
 *   near  props along the floor and edges with glowing parts; in dark water only
 *         their glow shows, it flows up the prop (frames _e0.._e3, a cycled ramp)
 *         and flares when a heartbeat passes
 *
 * A zone lists its props as [sprite, x, layer, flip]: x is a share of the water's
 * width, and every prop stands on the bottom edge of the water. Glow points come
 * from build_assets (ATLAS.props[name].pts = [[x, y, r], ...]) and feed the light map.
 * Background life: a far school of fish, and now and then something huge.
 */
"use strict";

let scenery = []; // this zone's props, placed for the current layout

// parallax: the scenery leans away from the pointer, near layers more than far
// ones (in whole pixels). `view` eases towards where the pointer is over the
// water, -1..1 on each axis, and drifts back to the middle when it leaves.
const PARALLAX = { far: 5, mid: 9, near: 14 };
const BG_MARGIN = 16; // spare backdrop on every side, more than drift + PARALLAX.far
const view = { x: 0, y: 0 };
function updateView(dt) {
  let tx = 0, ty = 0;
  if (ui.mouse.in && !ui.mouse.touch && ui.mouse.x < play.w && ui.mouse.y < play.h) {
    tx = -Math.max(-1, Math.min(1, (ui.mouse.x - play.cx) / (play.w / 2)));
    ty = -Math.max(-1, Math.min(1, (ui.mouse.y - play.cy) / ((play.h - play.top) / 2)));
  }
  const k = Math.min(1, dt * 2.5);
  view.x += (tx - view.x) * k; view.y += (ty - view.y) * k;
}

function placeProps() {
  scenery = [];
  for (const [spr, fx, layer, flip] of Z.props || []) {
    const r = ATLAS.sprites[spr];
    if (!r) continue;
    const [w, h] = [r[2], r[3]];
    // near props sit on the floor; mid ones a little higher, behind the haze
    const x = Math.round(fx * play.w - w / 2);
    const y = play.h - h + (layer === "near" ? 8 : -6);
    scenery.push({ spr, x, y, w, h, layer, flip: !!flip, flash: 0, phase: Math.random() * 4,
      pts: (ATLAS.props && ATLAS.props[spr] && ATLAS.props[spr].pts) || [] });
  }
}

// whole-pixel sway: the near layer moves more than the mid one
function propOffset(p) {
  return Math.round(Math.sin(now * 0.05) * 2 + view.x * PARALLAX[p.layer]);
}
const propDy = p => Math.round(view.y * PARALLAX[p.layer] * 0.5);

// mid silhouettes, drawn over the backdrop and under the reef
function drawMidProps() {
  const fog = LT.fog || LT.water;
  for (const p of scenery) {
    if (p.layer !== "mid") continue;
    const x = p.x + propOffset(p), y = p.y + propDy(p);
    if (p.flip) { ctx.save(); ctx.translate(x * 2 + p.w, 0); ctx.scale(-1, 1); }
    silhouette(p.spr, x, y, fog);
    if (p.flip) ctx.restore();
  }
}

// near props: in sunlit water the painted prop; in the dark a black body
function drawNearProps(lm) {
  for (const p of scenery) {
    if (p.layer !== "near") continue;
    const x = p.x + propOffset(p), y = p.y + propDy(p);
    if (!lm) { sprite(p.spr, x, y, p.flip); continue; }
    if (p.flip) { ctx.save(); ctx.translate(x * 2 + p.w, 0); ctx.scale(-1, 1); }
    silhouette(p.spr, x, y, "#04060c");
    if (p.flip) ctx.restore();
  }
}

// after the light map: the glowing parts, flowing and flaring
function drawPropGlow() {
  for (const p of scenery) {
    if (p.layer !== "near" || !p.pts.length) continue;
    const f = Math.floor(now * 5 + p.phase) % 4;
    const name = p.spr + "_e" + f;
    if (!ATLAS.sprites[name]) continue;
    const x = p.x + propOffset(p), y = p.y + propDy(p);
    sprite(name, x, y, p.flip);
    if (p.flash > 0.3) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.ceil(p.flash * 3) / 3;
      sprite(name, x, y, p.flip);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }
}

function propPoint(p, [px, py]) {
  return [p.x + propOffset(p) + (p.flip ? p.w - px : px), p.y + propDy(p) + py];
}

function propLights(boost, fade) {
  for (const p of scenery) {
    if (p.layer !== "near") continue;
    for (const pt of p.pts) {
      const [x, y] = propPoint(p, pt);
      addLight(x, y, pt[2] * 2.2 * boost, (0.45 + 0.6 * p.flash) * fade);
    }
  }
}

// a heartbeat ring flares every prop it passes; called from updateHeart
function propRingHit(prev, r) {
  for (const p of scenery) {
    if (!p.pts.length) continue;
    const [x, y] = propPoint(p, p.pts[0]);
    const d = Math.hypot(x - play.cx, y - play.cy);
    if (d >= prev && d < r) p.flash = 1;
  }
}

function updateProps(dt) {
  updateView(dt);
  for (const p of scenery) p.flash = Math.max(0, p.flash - dt * 1.2);
  updateLife(dt);
}

// ------------------------------------------------------------ far life

const life = { school: null, giant: null, nextGiant: 90 + Math.random() * 120 };

function updateLife(dt) {
  // a school of small fish crosses far behind the reef, every so often
  if (!life.school && Math.random() < dt / 25) {
    const left = Math.random() < 0.5, n = 10 + Math.floor(Math.random() * 12);
    life.school = { x: left ? -30 : play.w + 30, y: play.top + 20 + Math.random() * (play.h - play.top) * 0.5,
      vx: (left ? 1 : -1) * (7 + Math.random() * 5), t: 0,
      fish: Array.from({ length: n }, () => ({ ox: (Math.random() - 0.5) * 36, oy: (Math.random() - 0.5) * 16,
        ph: Math.random() * 6 })) };
  }
  const s = life.school;
  if (s) {
    s.t += dt; s.x += s.vx * dt; s.y += Math.sin(s.t * 0.4) * 2 * dt;
    if (s.x < -60 || s.x > play.w + 60) life.school = null;
  }
  // and rarely, something enormous, very far away
  if (!life.giant && (life.nextGiant -= dt) <= 0) {
    const left = Math.random() < 0.5;
    life.giant = { x: left ? -130 : play.w + 130, y: play.top + (play.h - play.top) * (0.2 + Math.random() * 0.3),
      vx: (left ? 1 : -1) * 4, flip: !left };
  }
  const g = life.giant;
  if (g) {
    g.x += g.vx * dt;
    if (g.x < -150 || g.x > play.w + 150) { life.giant = null; life.nextGiant = 180 + Math.random() * 240; }
  }
}

// behind everything but the backdrop: silhouettes in lit water, glowing
// specks in the dark (drawn after the light map, see drawLifeGlow)
function drawLife(lm) {
  if (lm) return;
  const fog = LT.fog || LT.water;
  if (life.giant) {
    const g = life.giant, [w, h] = spriteSize("leviathan");
    if (g.flip) { ctx.save(); ctx.translate(Math.round(g.x) * 2, 0); ctx.scale(-1, 1); }
    silhouette("leviathan", Math.round(g.x - w / 2), Math.round(g.y - h / 2), fog);
    if (g.flip) ctx.restore();
  }
  if (life.school) for (const f of schoolFish()) rect(f[0], f[1], 2, 1, fog);
}

function drawLifeGlow() {
  const s = life.school, g = life.giant;
  if (g) {
    ctx.globalAlpha = 0.35;
    spriteC("leviathan_e", g.x, g.y, g.flip);
    ctx.globalAlpha = 1;
  }
  if (s) for (const f of schoolFish()) if ((f[2] * 7 + Math.floor(now * 3)) % 5) rect(f[0], f[1], 1, 1, LT.ray);
}

function schoolFish() {
  const s = life.school;
  return s.fish.map((f, i) => [Math.round(s.x + f.ox + Math.sin(s.t * 1.3 + f.ph) * 2),
    Math.round(s.y + f.oy + Math.cos(s.t * 1.1 + f.ph) * 1.5), i]);
}
