/* The tutorial, woven into play — no text boxes.
 *
 * Each lesson waits for its moment (`when`), shows one cue inside the game — a
 * pixel hand, corner brackets around the target, at most a one-word verb — and
 * ends as soon as the player has done the thing (`done`), cue or not.  Only one
 * cue is on screen at a time; the order of LESSONS is the priority.
 *
 * The game also teaches by what it shows: the resonance plate, the current
 * meter and the Descend button stay hidden until they matter (revealed()), taps
 * and income fly into the counter as motes, and the first thread plays in slow
 * motion.  Every lesson is a codex page too (help.js); SHOW ME replays the cue.
 */
"use strict";

const tut = {
  active: null, t: 0, slow: 1, moment: null, threadDone: false, sinceThread: 0, heldFor: 0,
  replay: null, reveal: { res: 0, current: 0, descend: 0 }, moteT: 0, ghost: null, pair: null,
};

const learned = id => S.learned.includes(id);
function learn(id) { if (!learned(id)) { S.learned.push(id); save(); } }
const has = id => (S.owned[id] || 0) > 0;
const speciesOwned = () => SPECIES.filter(s => has(s.id)).length;
const affordableUpgrade = () =>
  UPGRADES.filter(u => !S.upg.includes(u.id) && u.req(S) && S.lumen >= u.cost).sort((a, b) => a.cost - b.cost)[0];

const LESSONS = [
  { id: "tap", when: () => true, done: () => S.clicks >= 5 || baseRate() > 0 },
  { id: "spore", when: () => !!spore, done: () => (S.spores || 0) > 0 },
  { id: "buy", when: () => S.lumen >= SP.plankton.cost, done: () => baseRate() > 0 },
  { id: "income", when: () => baseRate() > 0, done: () => tut.active === "income" && tut.t > 5 },
  { id: "mutation", when: () => !!affordableUpgrade(), done: () => S.upg.length > 0 },
  { id: "second", when: () => speciesOwned() === 1 && S.lumen >= SP.jelly.cost * 0.5, done: () => speciesOwned() >= 2 },
  { id: "thread", when: () => speciesOwned() >= 2, done: () => tut.threadDone },
  { id: "current", when: () => learned("thread") && tut.sinceThread > 8 && creatures.length >= 4,
    done: () => tut.heldFor > 1 && (charged > 0 || tut.heldFor > 3) },
  { id: "descend", when: () => pearlsAvailable() >= 1, done: () => S.depth > 0 },
];

// HUD pieces appear when the player first needs them
function revealTarget(k) {
  if (!S.hints) return true;
  const replaying = tut.replay && tut.replay.id;
  if (k === "res") return learned("thread") || !!tut.moment || replaying === "thread";
  if (k === "current") return learned("current") || tut.active === "current" || replaying === "current" || current.on;
  return S.depth > 0 || S.pearls > 0 || S.allTime >= DESCEND_AT * 0.05 || replaying === "descend";
}
const revealed = k => tut.reveal[k];

function tutReset() {
  Object.assign(tut, { active: null, t: 0, slow: 1, moment: null, threadDone: false, sinceThread: 0,
    heldFor: 0, replay: null, ghost: null, pair: null });
  for (const k in tut.reveal) tut.reveal[k] = revealTarget(k) ? 1 : 0;
}

// at boot: returning players skip what their reef shows they already know
function tutInit() {
  if (params.has("demo")) { S.learned = LESSONS.map(l => l.id); S.read = PAGES.map(p => p.id); }
  if (speciesOwned() >= 3 || S.depth > 0) ["tap", "buy", "income", "second", "thread"].forEach(learn);
  for (const l of LESSONS) if (l.id !== "income" && l.done()) learn(l.id);
  tutReset();
}

// ------------------------------------------------------------------ update

function tutUpdate(dt) {
  for (const l of LESSONS) if (!learned(l.id) && l.done()) learn(l.id);
  const next = S.hints ? LESSONS.find(l => !learned(l.id) && l.when()) : null;
  const id = next ? next.id : null;
  if (id !== tut.active) { tut.active = id; tut.t = 0; tut.ghost = null; tut.pair = null; }
  tut.t += dt;
  if (learned("thread")) tut.sinceThread += dt;
  tut.heldFor = currentLive() ? tut.heldFor + dt : 0;

  for (const k in tut.reveal) {
    const d = (revealTarget(k) ? 1 : 0) - tut.reveal[k];
    tut.reveal[k] += Math.sign(d) * Math.min(Math.abs(d), dt * 2.5);
  }

  if (tut.replay && (tut.replay.t += dt) > 7) tut.replay = null;
  const cue = tut.replay ? tut.replay.id : tut.active;

  // income: light visibly streams from the creatures into the counter
  if (cue === "income" || cue === "buy" && tut.replay) {
    if ((tut.moteT -= dt) <= 0 && creatures.length) {
      tut.moteT = 0.3;
      const c = creatures[(Math.random() * creatures.length) | 0];
      sendMote(c.x, c.y, "counter", c.s.glow);
    }
  }
  if (cue === "spore" && spore) spore.slow = 0.5;
  // before the first thread, the water brings two different species together
  // (whatever cue is showing — a passing spore shouldn't stall the lesson)
  if (S.hints && !learned("thread") && !tut.moment && speciesOwned() >= 2) nudgePair(dt);
  if (tut.replay && tut.replay.id === "thread" && tut.replay.link && (tut.moteT -= dt) <= 0) {
    tut.moteT = 0.15;
    const { a, b } = tut.replay.link;
    sendMote((a.x + b.x) / 2, (a.y + b.y) / 2, "res", C.violet);
  }

  // the first thread: slow motion, light pouring into the resonance plate
  tut.slow = 1;
  const m = tut.moment;
  if (m) {
    m.t += dt;
    tut.slow = m.t < 1.4 ? 0.25 : Math.min(1, 0.25 + (m.t - 1.4) * 0.8);
    if (m.t > 0.3 && m.t < 2 && (m.mote -= dt) <= 0) {
      m.mote = 0.1;
      sendMote((m.a.x + m.b.x) / 2, (m.a.y + m.b.y) / 2, "res", C.violet);
    }
    if (m.t > 2.6 || !creatures.includes(m.a) || !creatures.includes(m.b)) {
      tut.moment = null; tut.threadDone = true; tut.slow = 1;
    }
  }
}

function nudgePair(dt) {
  let [a, b] = tut.pair || [];
  if (!a || !creatures.includes(a) || !creatures.includes(b)) {
    let best = Infinity;
    for (const p of creatures) for (const q of creatures) {
      if (p.s === q.s || p.born < 1 || q.born < 1) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < best) { best = d; a = p; b = q; }
    }
    if (!a) return;
    tut.pair = [a, b];
    b.orb = a.orb; b.dir = a.dir; // same orbit band, same direction: they drift as a pair
  }
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  if (d < LINK_RANGE * 0.7) return;
  const k = Math.min(d, 30 * dt);
  a.x += (dx / d) * k; a.y += (dy / d) * k; b.x -= (dx / d) * k; b.y -= (dy / d) * k;
}

function tutOnThread(a, b) {
  if (learned("thread") || tut.moment) return;
  if (!S.hints) { tut.threadDone = true; return; }
  tut.moment = { a, b, t: 0, mote: 0 };
  floatText((a.x + b.x) / 2, (a.y + b.y) / 2 - 10, "THREAD", C.violet, "caps");
  chime(pent(12), 0.06, 2.2); chime(pent(14), 0.05, 2.2, "sine", 0.15);
}

// replay a lesson's cue from the codex
function tutReplay(id) {
  tut.replay = { id, t: 0 };
  if (id === "spore" && !spore) {
    // a practice spore: slow, and it pays nothing
    spore = { x: -12, y: play.top + (play.h - play.top) * 0.35, vx: 22, t: 0, practice: true };
  }
  if (id === "thread") tut.replay.link = [...links.values()].find(l => l.alive) || null;
}

// ------------------------------------------------------------------ cues

// a pointing hand, fingertip at (x, y); `o` outline, `w` glove, `s` shade
const HAND = [
  "....oo......",
  "...owwo.....",
  "...owwo.....",
  "...owwo.....",
  "...owwooo...",
  "...owwowwoo.",
  ".ooowwowwowo",
  "owwowwwwwwwo",
  "owwwwwwwwwwo",
  ".owwwwwwwwwo",
  "..owwwwwwwso",
  "..owwwwwwso.",
  "...owwwwwso.",
  "...ooooooo..",
];
const HAND_COL = { o: C.ink, w: "#f4f8ff", s: "#9fb4cc", ".": null };
function drawHand(x, y, press = false, alpha = 1) {
  x = Math.round(x) - 4 + (press ? 1 : 0); y = Math.round(y) + (press ? 1 : 0);
  ctx.globalAlpha = alpha;
  HAND.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = HAND_COL[row[i]];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + j, 1, 1); }
    }
  });
  ctx.globalAlpha = 1;
}

// the hand taps its target over and over, with a ripple under the fingertip
function pointAt(x, y, word, tapping = true, alpha = 1, wordAt = null) {
  const ph = (now * 1.4) % 1, press = tapping && ph < 0.22;
  if (press) { ctx.globalAlpha = 0.8 * alpha; ring(x, y, 2 + ph * 14, C.gold, 3); ctx.globalAlpha = 1; }
  drawHand(x, y + (tapping ? 0 : Math.round(Math.sin(now * 3))), press, alpha);
  if (word) cueWord(word, ...(wordAt || [x + 11, y + 5]));
}
// in the menu the word goes under the target, so it never covers the row's own text
const pointAtHot = (h, word) => pointAt(h.x + 12, h.y + 14, word, true, 1, [h.x + 24, h.y + h.h + 3]);

function cueWord(word, x, y) {
  const w = textWidth(word, "caps");
  if (x + w > VW - 4) x -= w + 22;
  text(word, x, y + (Math.floor(now * 2) % 2), { font: "caps", colour: C.gold });
}

// animated corner brackets around a rectangle (with a 1px ink shadow)
function brackets(x, y, w, h, colour = C.gold) {
  const o = 2 + (Math.floor(now * 3) % 2), L = 4;
  const corner = (cx, cy, dx, dy) => {
    for (const [c, off] of [[C.ink, 1], [colour, 0]]) {
      rect((dx > 0 ? cx : cx - L + 1) + off, cy + off, L, 1, c);
      rect(cx + off, (dy > 0 ? cy : cy - L + 1) + off, 1, L, c);
    }
  };
  const l = x - o, t = y - o, r = x + w + o - 1, b = y + h + o - 1;
  corner(l, t, 1, 1); corner(r, t, -1, 1); corner(l, b, 1, -1); corner(r, b, -1, -1);
}
const hot = id => ui.hot.find(h => h.id === id);
function bracketHot(id) { const h = hot(id); if (h) brackets(h.x, h.y, h.w, h.h); return h; }

function drawTutorial() {
  if (ui.codex || ui.modal || descent.active) return;
  if (tut.moment) drawThreadMoment(tut.moment.a, tut.moment.b);
  const cue = tut.replay ? tut.replay.id : tut.active;
  if (!cue) return;

  if (cue === "tap") pointAt(play.cx + 7, play.cy + 7, "TAP");
  else if (cue === "spore" && spore) {
    ctx.globalAlpha = 0.9; ring(spore.x, spore.y, 11 + (Math.floor(now * 4) % 2), C.gold, 3, Math.floor(now * 8)); ctx.globalAlpha = 1;
    pointAt(spore.x + 4, spore.y + 5, "CATCH");
  } else if (cue === "buy" || cue === "second") {
    const target = tut.replay ? SPECIES.find(x => bulkCost(x, 1) <= S.lumen) || SP.plankton
      : cue === "buy" ? SP.plankton : SPECIES.find(x => x.index > 0 && !has(x.id)) || SP.jelly;
    const h = bracketHot("s:" + target.id);
    if (h && bulkCost(target, 1) <= S.lumen) pointAtHot(h, "BUY");
  } else if (cue === "income") {
    const [x, y, w] = hudAnchor.rate;
    ctx.fillStyle = C.gold;
    for (let i = 0; i < w; i++) if ((i + Math.floor(now * 10)) % 4 < 2) ctx.fillRect(x + i, y, 1, 1);
  } else if (cue === "mutation") {
    const u = affordableUpgrade() || UPGRADES.find(x => hot("u:" + x.id));
    const h = u && bracketHot("u:" + u.id);
    if (h && S.lumen >= u.cost) pointAt(h.x + 9, h.y + 12, "BUY", true, 1, [h.x + h.w + 4, h.y + 6]);
  } else if (cue === "thread" && tut.replay && tut.replay.link) {
    drawThreadMoment(tut.replay.link.a, tut.replay.link.b);
  } else if (cue === "current") drawGhostCurrent();
  else if (cue === "descend") {
    const h = bracketHot("descend");
    if (h && pearlsAvailable() >= 1) pointAt(h.x + 12, h.y + 16);
  }
}

// rings around both creatures of a thread, the thread traced twice as bright
function drawThreadMoment(a, b) {
  const ax = a.x, ay = a.y + bob(a), bx = b.x, by = b.y + bob(b);
  const ph = Math.floor(now * 8);
  ring(ax, ay, a.s.size * 0.6 + 3, C.violet, 3, ph);
  ring(bx, by, b.s.size * 0.6 + 3, C.violet, 3, ph);
  const mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12;
  curve(ax, ay - 1, mx, my - 1, bx, by - 1, "#ffffff", "#ffffff");
  curve(ax, ay, mx, my, bx, by, a.s.glow, b.s.glow);
}

// a ghost hand holds the water next to some creatures, with a ghost vortex
function drawGhostCurrent() {
  const [mx, my] = hudAnchor.meter;
  brackets(mx - 25, my - 4, 50, 9);
  if (current.on) return; // the player is doing it
  if (!tut.ghost) {
    const c = creatures.filter(c => !c.s.big)[(Math.random() * creatures.length) | 0] || { x: play.cx - 60, y: play.cy };
    tut.ghost = { x: Math.max(30, Math.min(play.w - 30, c.x + 14)), y: Math.max(play.top + 20, Math.min(play.h - 30, c.y + 10)) };
  }
  const ph = (now % 3.2) / 3.2, held = ph > 0.15 && ph < 0.85;
  const gx = tut.ghost.x + (held ? Math.cos(now * 2) * 5 : 0), gy = tut.ghost.y + (held ? Math.sin(now * 2) * 4 : 0);
  if (held) {
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 3; i++) {
      const r = 10 + i * 9, a0 = now * (2.4 - i * 0.4) + i;
      arcDots(gx, gy, r, a0, a0 + 1.4, i % 2 ? C.gold : "#8feaff");
      arcDots(gx, gy, r, a0 + Math.PI, a0 + Math.PI + 1, i % 2 ? C.gold : "#8feaff");
    }
    ctx.globalAlpha = 1;
  }
  drawHand(gx, gy, held, 0.85);
  cueWord("HOLD", gx + 11, gy + 5);
}
