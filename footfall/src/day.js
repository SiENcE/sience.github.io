/* One turn = one day, played out.
 *
 * END DAY fixes the day's plan (sim.js), then plays it: dawn, everyone walks to
 * work (faster on worn paths), midday production flies into the HUD, the walk
 * home (some via the tavern) at dusk, night, and newcomers sailing in.  All the
 * numbers come from the plan; this file only animates them.  Clicking END DAY
 * again while a day plays fast-forwards it.
 */
"use strict";

const day = { on: false, t: 0, P: null, walkers: [], boats: [], fast: false, marks: {}, stage: "" };

const CARRY_OF = { field: "food", fisher: "fish", woodcutter: "wood", market: "coin", tavern: "coin", workshop: "goods",
  lodge: "food", pier: "coin", shepherd: "goods", ferry: "fish", grandmarket: "coin", townhall: "coin" };

function makeWalker(v, route, t0, spc, carry, stops = []) {
  // time to reach each tile along the route; stops are {at: index, dur}
  const times = [t0];
  for (let k = 1; k < route.length; k++) {
    const cost = (k === route.length - 1 && !walkable(route[k] % N, (route[k] / N) | 0) ? R.door : enterCost(route[k]))
      + Math.max(0, heightAt(route[k]) - heightAt(route[k - 1])) * R.climb;
    let t = times[k - 1] + cost * spc;
    const s = stops.find(s => s.at === k - 1);
    if (s) t += s.dur;
    times.push(t);
  }
  return { v, route, times, carry, stops, end: times[times.length - 1] };
}

function startDay() {
  if (day.on) { day.fast = true; return; }
  if (ui.codex || ui.modal || ui.chart) return;
  ui.tool = null;
  const P = plan();
  day.on = true; day.t = 0; day.P = P; day.fast = false; day.walkers = []; day.boats = []; day.stage = "dawn";
  day.first = S.day === 1;

  const maxAm = Math.max(1, ...P.walks.map(w => routeCost(w.am)));
  const maxPm = Math.max(1, ...P.walks.map(w => routeCost(w.pm)));
  // seconds per unit of walking cost: slow enough to watch, but a long walk is capped
  const spcAm = Math.min(0.5, 3 / maxAm), spcPm = Math.min(0.5, 3 / maxPm);
  const look = id => (S.vil.find(v => v.id === id) || { look: 0 }).look;

  let amEnd = 1.2;
  const arrive = [];
  P.walks.forEach((w, i) => {
    const t0 = 0.5 + ((i * 0.37) % 0.7);
    const wk = makeWalker(look(w.v), w.am, t0, spcAm, w.build ? "wood" : null); // builders carry planks to the site
    day.walkers.push(wk); amEnd = Math.max(amEnd, wk.end);
    arrive[i] = wk.end;
  });
  day.marks.work = amEnd + 0.35;
  let pmEnd = day.marks.work + 2;
  P.walks.forEach((w, i) => {
    const job = bById(w.job), t0 = day.marks.work + 1.1 + ((i * 0.29) % 0.6), stop = w.stop && bById(w.stop);
    // at the hearth they sit a while by the fire, so the gathering can be seen
    const stops = stop ? [{ at: w.pm.indexOf(idx(stop.x, stop.y)), dur: stop.t === "hearth" ? HEARTH_SIT : 0.7, hearth: stop.t === "hearth" }] : [];
    const wk = makeWalker(look(w.v), w.pm, t0, spcPm, P.jobs[w.v] ? CARRY_OF[job.t] || null : null, stops);
    // villagers without work spend the day by the fire
    if (job.t === "hearth") wk.sit = [arrive[i], t0 + 0.2];
    day.walkers.push(wk); pmEnd = Math.max(pmEnd, wk.end);
  });
  day.marks.dusk = day.marks.work + 0.9;
  day.marks.night = pmEnd + 0.3;
  day.marks.end = day.marks.night + 1.6;
  // the flocks: out to graze in the morning, home at dusk, a little apart
  day.flocks = P.flocks.map(f => {
    const back = f.route.slice().reverse();
    return Array.from({ length: f.n }, (_, k) => ({
      out: makeWalker(0, f.route, 0.6 + k * 0.25, 0.4, null), home: makeWalker(0, back, day.marks.dusk - 0.4 + k * 0.25, 0.4, null), k }));
  });
  // a migrating herd crosses in the morning, one behind the other
  day.herds = P.herds.filter(h => h.route).map(h => Array.from({ length: h.n }, (_, k) => ({ w: makeWalker(0, h.route, 0.3 + k * 0.35, 0.3, null), k })));
  day.did = {};
  day.cards = [];
  sfx.dayStart();
}

// the day's speed: the first day plays slowly (the tutorial watches it); sleep races
const daySpeed = () => (ui.sleep ? 8 : day.fast ? 4 : ui.fast ? 2 : 1) * TIME_SCALE * (tut.slow || 1);

function updateDay(dt) {
  if (!day.on) {
    night.k = Math.max(0, night.k - dt * 1.5);
    if (ui.sleep && !ui.modal && !ui.codex && !ui.title) startDay();
    if (visiting && !ui.chart && !ui.modal) startDay(); // a visited island's last day, over and over
    return;
  }
  const t0 = day.t;
  day.t += dt * daySpeed();
  const t = day.t, M = day.marks;
  const crossed = m => t0 < m && t >= m;

  // light: warm dawn fading out, dusk warming up, then night
  if (t < 0.8) { night.k = 0.35 * (1 - t / 0.8); night.col = "#f0b890"; }
  else if (t < M.dusk) night.k = 0;
  else if (t < M.night) { night.k = 0.45 * Math.min(1, (t - M.dusk) / (M.night - M.dusk)); night.col = lerpHex("#f8d0a0", "#e89878", night.k / 0.45); }
  else { const k = Math.min(1, (t - M.night) / 0.6); night.k = 0.45 + 0.55 * k; night.col = lerpHex("#e89878", "#5a64a8", k); }

  day.stage = t < M.work ? "morning" : t < M.dusk + 0.3 ? "work" : t < M.night ? "evening" : "night";

  // footprints behind walkers
  for (const w of day.walkers) {
    const p = walkerPos(w, t);
    if (p && Math.random() < dt * daySpeed() * 5) fx.prints.push({ x: p.tx, y: p.ty, ox: (Math.random() - 0.5) * 10, oy: 6 + Math.random() * 4, t: 0 });
  }

  if (crossed(M.work) && !day.did.work) doWork();
  if (crossed(M.night) && !day.did.night) doNight();
  for (const b of day.boats) b.t += dt * daySpeed();
  if (t >= M.end && day.boats.every(b => b.done)) finishDay();
}

function doWork() {
  day.did.work = true;
  const P = day.P;
  if (!visiting) applyWork(P);
  let k = 0;
  for (const b of S.b) {
    const o = P.out[b.id];
    if (!o) continue;
    const [sx, sy] = tileTop(b.x, b.y);
    // what the weather stopped
    if (o.flooded) { floatText(sx, sy - 14, "flooded", C.sky, "small"); continue; }
    if (o.ashore) { floatText(sx, sy - 14, "ashore: storm", C.sky, "small"); continue; }
    if (o.resting) { floatText(sx, sy - 14, "resting", C.dim, "small"); continue; }
    if (!o.worker) { floatText(sx, sy - 14, "no worker", C.dim, "small"); continue; }
    if (o.gulls) floatText(sx, sy - 6, "gulls -" + o.gulls, C.red, "small");
    if (o.amt > 0) {
      floatText(sx, sy - 16, "+" + o.amt, C.text, "caps", "i_" + o.res);
      for (let i = 0; i < Math.min(o.amt, 4); i++) setTimeout(() => sendMote(sx, sy - 8, o.res, C[o.res]), (k++ % 12) * 40 + i * 90);
    }
    if (o.tired) floatText(sx, sy - 6, "tired -" + o.tired, C.red, "small");
  }
  for (const [i, c] of P.stalls) if (c) { const [sx, sy] = tileTop(i % N, (i / N) | 0); floatText(sx, sy - 6, "+" + c, C.text, "caps", "i_coin"); }
  for (const h of P.herds) if (h.turned) { const [sx, sy] = tileTop(h.from % N, (h.from / N) | 0); floatText(sx, sy - 10, "trees turned the herd back", C.dim, "small", null, 2.5); }
  sfx.work();
}

function doNight() {
  day.did.night = true;
  const P = day.P, hearth = S.b.find(b => b.t === "hearth");
  const [hx, hy] = tileTop(hearth.x, hearth.y);
  floatText(hx, hy - 18, "-" + P.eat, P.hungry ? C.red : C.text, "caps", "i_food");
  if (P.hungry) floatText(hx, hy - 30, "hungry", C.red, "caps");
  if (P.weather.storm && !visiting) floatText(hx, hy - 42, "no boats in the storm", C.sky, "small", null, 2.5);
  if (P.serpent && !visiting) floatText(hx, hy - 42, "a serpent! a boat turns back", C.sky, "small", null, 2.5);
  if (P.weather.harvest && !visiting) floatText(hx, hy - 42, "HARVEST", C.gold, "caps", null, 2.5);
  const arrived = visiting ? [] : applyNight(P);
  if (P.rise && !visiting) { floatText(hx, hy - 54, "THE SEA RISES", C.sky, "caps", null, 3); for (const i of P.rise) { const [sx, sy] = tileMid(i % N, (i / N) | 0); burst(sx, sy, "#a6dbe6", 3, 20); } }
  // tribute boats sail in with crates
  const dock = S.b.find(b => b.t === "harbour") || hearth;
  for (let k = 0; k < (visiting ? 0 : P.tribute.boats); k++) day.boats.push(makeBoat({ look: 0, home: dock.id, cargo: P.tribute.from[k] }, 0.8 + k * 0.6));
  for (const id of P.finish) {
    const b = bById(id);
    if (!b) continue;
    const [sx, sy] = tileTop(b.x, b.y);
    floatText(sx, sy - 26, b.t === "house" ? "HOUSE" : "BUILT", C.gold, "caps", null, 2);
    burst(sx, sy, "#f4f0ea", 14, 36);
  }
  if (P.finish.length) sfx.build();
  day.arrived = arrived;
  arrived.forEach((v, i) => day.boats.push(makeBoat(v, i * 0.5)));
  if (!visiting) momentsNight(P, hx, hy);
  terrain.dirty = true; // paths wore in
  sfx.night();
}

// what the day's moments did (events.js, shapes.js), told over the island
function momentsNight(P, hx, hy) {
  const M = moments, at = i => tileTop(i % N, (i / N) | 0);
  if (M.reached) {
    const o = M.reached, [sx, sy] = at(o.at);
    const say = { hermit: ["THE HERMIT", o.boon ? "gives a boon: " + BOONS.find(b => b.id === o.boon).name : "gives a purse of coins"],
      shrine: ["A SHRINE", "its page is in the codex"], boat: ["CASTAWAYS", `${o.join} of them join the village`],
      wreck: ["THE WRECK", `+${o.gift.wood} wood, and a castaway`], treasure: ["TREASURE!", `+${o.gift.coin} coins`] }[o.kind || o.id];
    floatText(sx, sy - 28, say[0], C.gold, "caps", null, 3);
    floatText(sx, sy - 18, say[1], C.text, "small", null, 3);
    burst(sx, sy, C.gold, 18, 40);
    sfx.milestone();
    // and when the day is over, a card says what it was and what it brought
    day.cards.push(() => eventCard(o));
  }
  if (M.ended && M.ended.how === "gone" && M.ended.id !== "herd") floatText(hx, hy - 54, { wreck: "the tide took the wreck", treasure: "the pirates came back for their gold" }[M.ended.id] || "the stranger's trail went cold", C.dim, "small", null, 2.5);
  // letters answered: the boat takes the goods home, and brings a double load back
  for (const L of P.letters || []) { const d = S.b.find(b => b.t === "harbour") || hearthB, [sx, sy] = tileTop(d.x, d.y); floatText(sx, sy - 30, `${L.name}: -${L.n} ${L.res}`, C.coin, "small", null, 3); }
  // castaways sail in to the beds they found (the rest sleep by the hearth for now)
  M.joined.forEach((v, k) => { if (bById(v.home)) day.boats.push(makeBoat(v, 0.4 + k * 0.5)); });
  if (M.merchant) {
    const t = S.b.find(b => b.t === "tavern") || hearthB, [tx, ty] = tileTop(t.x, t.y);
    if (M.merchant.lit) floatText(tx, ty - 30, "THE NIGHT MERCHANT STOPS", C.gold, "caps", null, 3);
    else floatText(hx, hy - 66, "the merchant sails past: no lit path from the shore to a tavern", C.dim, "small", null, 3);
  }
  if (M.feast) { fireworks.until = now + 6; floatText(hx, hy - 30, "THE FEAST", C.gold, "caps", null, 3); }
  for (const f of M.found) {
    tut.secret = { t: 0, tiles: f.tiles };
    if (f.id !== "shrine") day.cards.push(() => secretCard(f)); // (the shrine's card is the stranger's)
    sfx.milestone();
  }
}

function finishDay() {
  day.on = false; day.stage = "";
  if (visiting) return;
  night.k = Math.min(night.k, 1);
  const passed = checkMilestones();
  refreshForecast();
  save();
  for (const m of passed) celebrate(m);
  tutAfterDay(day.P);
  tutNews();
  // what the night found, told on cards; a letter that came with the morning
  for (const c of day.cards || []) c();
  day.cards = [];
  for (const L of moments.letters) { const a = hudAnchor.letters || [VW - 20, 50]; screenText(a[0] - 40, a[1] + 10, `A LETTER FROM ${L.name.toUpperCase()}`, C.coin, "caps", 3); }
  if (ui.sleep) {
    const why = wakeReason(passed, day.P);
    if (why) { ui.sleep = false; screenText(VW / 2, VH / 2 - 60, why, C.gold, "caps", 2.5); }
  }
}

function lerpHex(a, b, k) {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, k))).toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------ walkers

// tile coordinates and screen position of a walker at time t, or null if indoors
function walkerPos(w, t) {
  if (t < w.times[0] || t >= w.end) return null;
  let k = 1;
  while (k < w.times.length - 1 && w.times[k] <= t) k++;
  const a = w.route[k - 1], b = w.route[k];
  const seg = w.times[k] - w.times[k - 1];
  const stop = w.stops.find(s => s.at === k - 1);
  // a stop is spent inside the building at the start of the segment
  let f = (t - w.times[k - 1] - (stop ? stop.dur : 0)) / Math.max(1e-6, seg - (stop ? stop.dur : 0));
  if (f < 0) return null;
  f = Math.min(1, f);
  // hidden while still inside a door
  const first = k === 1, last = k === w.route.length - 1, atInn = !!stop;
  const intoStop = w.stops.some(s => s.at === k);
  if ((first || atInn) && f < 0.45) return null;
  if ((last || intoStop) && f > 0.55) return null;
  const ax = a % N, ay = (a / N) | 0, bx = b % N, by = (b / N) | 0;
  const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
  return { x, y, tx: f < 0.5 ? ax : bx, ty: f < 0.5 ? ay : by, flip: (bx - ax) - (by - ay) < 0, lift: liftAt(ax, ay) * (1 - f) + liftAt(bx, by) * f };
}

function collectWalkers(list) {
  if (!day.on) return;
  // sheep: out along the flock's route, grazing at its end all day, and home at dusk
  // the herd: deer in a loose line, a little apart
  for (const herd of day.herds || []) for (const d of herd) {
    const p = walkerPos(d.w, day.t);
    if (!p) continue;
    list.push({ d: p.x + p.y + 0.01, w: true, draw: () => {
      const sx = cam.x + (p.x - p.y) * 16 + [0, 4, -4, 7, -7][d.k % 5], sy = cam.y + (p.x + p.y) * 8 + 9 - p.lift + [0, 2, -2, 1, -1][d.k % 5];
      drawDeer(sx, sy, Math.floor(day.t * 6 + d.k) % 2, p.flip);
    } });
  }
  for (const flock of day.flocks || []) for (const s of flock) {
    const t = day.t, w = t < s.home.times[0] ? s.out : s.home;
    let p = walkerPos(w, t);
    if (!p && w === s.out && t >= s.out.end) {
      const end = s.out.route[s.out.route.length - 1];
      p = { x: end % N + [0.15, -0.2, 0.3][s.k], y: ((end / N) | 0) + [0.2, 0.25, -0.2][s.k], flip: s.k === 1, lift: liftAt(end % N, (end / N) | 0) };
    }
    if (!p) continue;
    list.push({ d: p.x + p.y + 0.01, w: true, draw: () => {
      const sx = cam.x + (p.x - p.y) * 16, sy = cam.y + (p.x + p.y) * 8 + 9 - p.lift;
      drawSheep(sx, sy, Math.floor(day.t * 5 + s.k) % 2, p.flip);
    } });
  }
  for (const w of day.walkers) {
    const p = walkerPos(w, day.t);
    if (!p) continue;
    list.push({ d: p.x + p.y + 0.01, w: true, draw: () => {
      const sx = cam.x + (p.x - p.y) * 16, sy = cam.y + (p.x + p.y) * 8 + 9 - p.lift;
      drawVillager(w.v, sx, sy, Math.floor(day.t * 7) % 2, p.flip, day.t > day.marks.work ? w.carry : null);
    } });
  }
}

// ------------------------------------------------------ the hearth gathering

const HEARTH_SIT = 1.6; // day-time seconds each villager sits by the fire
// seats on three log benches round the fire, front middle first (offsets from
// the tile's top vertex, where the sitter's feet rest)
const SEATS = [[0, 17], [-5, 17], [5, 17], [-13, 14], [13, 14], [-17, 12], [17, 12], [-21, 10], [21, 10]];
// three logs: one in front, one along each front edge of the tile (2:1)
const BENCHES = [[[-8, 17], [8, 17]], [[-11, 15], [-23, 9]], [[11, 15], [23, 9]]];
const hearthFade = { k: 0 };

// who sits by the fire right now
function hearthCrowd() {
  if (!day.on) return [];
  const out = [];
  for (const w of day.walkers) {
    if (w.sit && day.t >= w.sit[0] && day.t < w.sit[1]) out.push(w);
    for (const s of w.stops) if (s.hearth && day.t >= w.times[s.at] && day.t < w.times[s.at] + s.dur) out.push(w);
  }
  return out;
}

// the benches, drawn with the hearth
function drawBenches(sx, sy) {
  for (const [[ax, ay], [bx, by]] of BENCHES) {
    const n = Math.abs(bx - ax);
    const at = i => [sx + ax + Math.sign(bx - ax) * i, sy + ay + Math.round(((by - ay) * i) / n)];
    // a log: light top, dark side, an ink edge below and at both ends
    for (let i = 0; i <= n; i++) {
      const [x, y] = at(i);
      rect(x, y, 1, 1, "#c49460"); rect(x, y + 1, 1, 1, "#8e6238"); rect(x, y + 2, 1, 1, C.ink);
      if (i === 0 || i === n) rect(x + (i ? 1 : -1), y, 1, 2, C.ink);
    }
  }
}

// villagers sitting on the benches, chatting; more than fit get a count
function collectCrowd(list) {
  const crowd = hearthCrowd(), h = S.b.find(b => b.t === "hearth");
  // each sitter keeps their seat while others come and go
  const seats = day.seats || (day.seats = new Map());
  for (const w of [...seats.keys()]) if (!crowd.includes(w)) seats.delete(w);
  for (const w of crowd) {
    if (seats.has(w)) continue;
    const taken = new Set(seats.values()), free = SEATS.findIndex((_, i) => !taken.has(i));
    if (free >= 0) seats.set(w, free);
  }
  if (!crowd.length || !h) return;
  // drawn over everything near the fire: what stands in front is see-through meanwhile
  list.push({ d: h.x + h.y + 5, w: true, draw: () => {
    const [sx, sy] = tileTop(h.x, h.y);
    [...seats].sort((a, b) => SEATS[a[1]][1] - SEATS[b[1]][1]).forEach(([w, i]) => {
      const [ox, oy] = SEATS[i];
      drawVillager(w.v, sx + ox, sy + oy + 1, 2, ox > 0, null);
      // now and then someone has something to say
      if (Math.floor(now * 0.9 + i * 1.7) % 4 === 0) {
        const bx = sx + ox - 3, by = sy + oy - 17;
        rect(bx - 1, by - 1, 9, 6, C.ink); rect(bx, by, 7, 4, "#fff8ec"); rect(bx + 1, by + 4, 1, 2, C.ink);
        for (let d = 0; d < 3; d++) if (Math.floor(now * 4) % 4 >= d) rect(bx + 1 + d * 2, by + 2, 1, 1, C.ink);
      }
    });
    if (crowd.length > SEATS.length) {
      icon("person", sx - 10, sy - 29, C.green);
      text("+" + (crowd.length - SEATS.length), sx - 5, sy - 30, { font: "caps", colour: C.text, outline: true });
    }
  } });
}

// while they sit, whatever stands in front of the hearth turns see-through
function updateHearthFade(dt) {
  const target = hearthCrowd().length ? 1 : 0;
  hearthFade.k += Math.sign(target - hearthFade.k) * Math.min(Math.abs(target - hearthFade.k), dt * 3);
}
function hearthVeil(x, y) {
  const h = hearthFade.k > 0 && S.b.find(b => b.t === "hearth");
  if (!h || x + y <= h.x + h.y || Math.abs(x - h.x) > 2 || Math.abs(y - h.y) > 2) return 1;
  return 1 - 0.8 * hearthFade.k;
}

// -------------------------------------------------------------------- boats

// a newcomer sails in to the shore nearest their new home, then walks up to it (a
// shore on the open sea: one beside a sandbar only has no water to sail in on)
function makeBoat(v, delay) {
  const home = bById(v.home);
  let best = null, bd = Infinity;
  const sea = openSea(), open = (x, y) => inMap(x, y) ? ground(x, y) === "~" && sea[idx(x, y)] : true;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!walkable(x, y) || !DIRS.some(([dx, dy]) => ground(x + dx, y + dy) === "~" && open(x + dx, y + dy))) continue;
    const d = Math.abs(x - home.x) + Math.abs(y - home.y);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  if (!best) return { t: 0, done: true };
  const [lx, ly] = best;
  const [dx, dy] = DIRS.find(([dx, dy]) => ground(lx + dx, ly + dy) === "~" && open(lx + dx, ly + dy));
  const r = route(lx, ly, home.x, home.y);
  return { v, t: -delay, land: [lx, ly], sea: [lx + dx, ly + dy], dir: [dx, dy], walk: r && !v.cargo ? makeWalker(v.look, r, 1.8, 0.22, null) : null, done: false };
}

function collectBoats(list) {
  for (const b of day.boats) {
    if (b.done || !b.sea || b.t < 0) continue;
    const sail = 1.6, k = Math.min(1, b.t / sail);
    // sails in from 6 tiles out, along the shore's outward direction
    const far = 6 * (1 - k * (2 - k));
    const x = b.sea[0] + b.dir[0] * far, y = b.sea[1] + b.dir[1] * far;
    const leaving = b.t > sail + 0.6, gone = sail + 2.6;
    if (b.t < gone) {
      const out = leaving ? (b.t - sail - 0.6) * 3 : 0;
      const bx = x + b.dir[0] * out, by = y + b.dir[1] * out;
      // rises out of the haze on the way in, sinks back into it on the way out
      const alpha = Math.max(0, Math.min(1, b.t / 0.7, (gone - b.t) / 1.2));
      list.push({ d: bx + by, draw: () => {
        const sx = cam.x + (bx - by) * 16, sy = cam.y + (bx + by) * 8 + 11 + Math.round(Math.sin(now * 3));
        ctx.globalAlpha = alpha;
        spriteB("boat", sx, sy, b.dir[0] - b.dir[1] > 0);
        if (!leaving && !b.v.cargo) drawVillager(b.v.look, sx + 2, sy - 5, 0, false, null);
        if (!leaving && b.v.cargo) { rect(sx - 3, sy - 6, 5, 4, C.ink); rect(sx - 2, sy - 5, 3, 2, "#c49460"); }
        ctx.globalAlpha = 1;
      } });
    }
    if (b.t >= sail && !b.hopped) {
      b.hopped = true;
      const [sx, sy] = tileMid(...b.land);
      if (b.v.cargo) { floatText(sx, sy - 16, "TRIBUTE", C.gold, "caps"); floatText(sx, sy - 6, "from " + b.v.cargo, C.dim, "small"); }
      else { floatText(sx, sy - 16, "+1", C.green, "caps"); sendMote(sx, sy - 8, "pop", C.green); }
      sfx.arrive();
    }
    if (b.walk && b.t >= sail) {
      const p = walkerPos(b.walk, b.t);
      if (p) list.push({ d: p.x + p.y + 0.01, w: true, draw: () => {
        const sx = cam.x + (p.x - p.y) * 16, sy = cam.y + (p.x + p.y) * 8 + 9 - p.lift;
        drawVillager(b.v.look, sx, sy, Math.floor(now * 7) % 2, p.flip, null);
      } });
    }
    if (b.t > Math.max(sail + 2.6, b.walk ? b.walk.end : 0)) b.done = true;
  }
}
