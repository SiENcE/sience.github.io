/* The simulation: walking, jobs, and one day's plan.
 *
 * A day is deterministic.  plan() works out who works where, the route every
 * villager walks (morning and evening), what each building produces and who
 * arrives at night.  The same plan drives the forecast in the HUD, the day's
 * animation and the numbers applied at the end, so the forecast is exact.
 */
"use strict";

// ---------------------------------------------------------------- walking

// a tile's walking cost by its path level; rough ground costs more until it is
// worn: scree and snowfields until trodden to a trail, marsh until it is cobbled
// (boardwalks and causeways help)
function enterCost(i) {
  const lv = level(i), soil = S.soil[i];
  if (soil === "f") return R.ferry; // the ferry's lane over the water
  if (soil === "W") return lv === 3 ? R.step[3] : R.boardwalk;
  if (soil === "w" && lv < 3) return R.marsh;
  if (soil === "s" && lv === 0) return R.scree;
  if (soil === "i" && lv === 0) return R.snowfield;
  return R.step[lv];
}
const heightAt = i => (S.height ? +S.height[i] : 0);

// the cost of stepping onto each tile: its path level's step on walkable ground,
// DOOR_TILE for a building (entered, never crossed), BLOCKED for trees, rocks and
// water.  With it: `door`, the sides each tile can be entered from (doorMask), and
// `h`, the Highlands' heights (a step up costs R.climb a level; two levels is a
// cliff).  Kept for the whole of one plan(); worked out afresh otherwise
const DOOR_TILE = -1, BLOCKED = Infinity;
let stepGrid = null;
function steps() {
  if (stepGrid) return stepGrid;
  const E = new Float64Array(N * N), D = new Uint8Array(N * N).fill(15);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    E[i] = walkable(x, y) ? enterCost(i) : bAt(x, y) ? DOOR_TILE : BLOCKED;
  }
  for (const b of S.b) D[idx(b.x, b.y)] = doorMask(b);
  E.door = D;
  E.h = S.height ? Int8Array.from(S.height, c => +c) : null;
  return E;
}
const isWalk = e => e >= 0 && e !== BLOCKED;

// cheapest walking cost from (sx, sy) to every tile; building tiles can be
// entered (at the door cost, through the door) but not walked through
function costsFrom(sx, sy) {
  const E = steps(), NN = N * N, door = R.door, D = E.door, H = E.h, climb = R.climb, start = idx(sx, sy);
  const dist = new Float64Array(NN).fill(Infinity);
  heapReset();
  heapPush(0, start);
  dist[start] = 0;
  // k: the direction of the step i -> j (DIRS order); a building is entered from its side (k + 2) & 3
  const relax = (d, i, j, k) => {
    const e = E[j];
    let step;
    if (isWalk(e)) step = e;
    else if (e === DOOR_TILE && (D[j] >> ((k + 2) & 3)) & 1) step = door;
    else return;
    if (H) { const dh = H[j] - H[i]; if (dh > 1 || dh < -1) return; if (dh > 0) step += dh * climb; }
    if (d + step < dist[j]) { dist[j] = d + step; heapPush(d + step, j); }
  };
  while (HEAP.n) {
    const d = HEAP.k[0], i = heapPop();
    if (d > dist[i]) continue;
    // arrived at a door: stop here.  The start building is left through its door
    const out = isWalk(E[i]) ? 15 : i === start ? D[i] : 0;
    if (!out) continue;
    const x = i % N, y = (i / N) | 0;
    // the four neighbours in DIRS order: +x, +y, -x, -y
    if (x + 1 < N && out & 1) relax(d, i, i + 1, 0);
    if (y + 1 < N && out & 2) relax(d, i, i + N, 1);
    if (x > 0 && out & 4) relax(d, i, i - 1, 2);
    if (y > 0 && out & 8) relax(d, i, i - N, 3);
  }
  return dist;
}

// the route itself, A* with a tiny pull towards the straight line so that
// equal-cost routes cut across diagonally, the way people really walk
function route(ax, ay, bx, by) {
  const goal = idx(bx, by), start = idx(ax, ay), key = start * N * N + goal;
  // within one plan() the map doesn't change, so a route found once is found again
  // (house mates share their morning walk, workmates their way to the tavern)
  if (routeMemo && routeMemo.has(key)) return routeMemo.get(key);
  const r = findRoute(ax, ay, bx, by, start, goal);
  if (routeMemo) routeMemo.set(key, r);
  return r;
}
let routeMemo = null;
function findRoute(ax, ay, bx, by, start, goal) {
  const E = steps(), NN = N * N, door = R.door, cheapest = R.step[3], D = E.door, H = E.h, climb = R.climb;
  const g = new Float64Array(NN).fill(Infinity), from = new Int32Array(NN).fill(-1);
  const lx = bx - ax, ly = by - ay, ll = Math.hypot(lx, ly) || 1;
  g[start] = 0;
  heapReset();
  heapPush((Math.abs(ax - bx) + Math.abs(ay - by)) * cheapest, start);
  const relax = (i, j, nx, ny, k) => {
    const e = E[j];
    let step;
    if (j === goal) { if (!((D[j] >> ((k + 2) & 3)) & 1)) return; step = door; }
    else if (isWalk(e)) step = e;
    else return;
    if (H) { const dh = H[j] - H[i]; if (dh > 1 || dh < -1) return; if (dh > 0) step += dh * climb; }
    step += (Math.abs((nx - ax) * ly - (ny - ay) * lx) / ll) * 0.002;
    if (g[i] + step < g[j]) {
      g[j] = g[i] + step; from[j] = i;
      heapPush(g[j] + (Math.abs(nx - bx) + Math.abs(ny - by)) * cheapest, j);
    }
  };
  while (HEAP.n) {
    const i = heapPop();
    if (i === goal) break;
    const out = i === start ? D[i] : isWalk(E[i]) ? 15 : 0;
    if (!out) continue;
    const x = i % N, y = (i / N) | 0;
    if (x + 1 < N && out & 1) relax(i, i + 1, x + 1, y, 0);
    if (y + 1 < N && out & 2) relax(i, i + N, x, y + 1, 1);
    if (x > 0 && out & 4) relax(i, i - 1, x - 1, y, 2);
    if (y > 0 && out & 8) relax(i, i - N, x, y - 1, 3);
  }
  if (from[goal] < 0 && goal !== start) return null;
  const path = [goal];
  while (path[path.length - 1] !== start) path.push(from[path[path.length - 1]]);
  return path.reverse();
}
// walking cost of a route (the tiles between the two doors, plus the door, plus
// every climb in the Highlands); remembered on the route, which only lives as
// long as the map it was found on
function routeCost(p) {
  if (p.cost === undefined) {
    let c = R.door;
    for (let k = 1; k < p.length - 1; k++) c += enterCost(p[k]);
    if (S.height) for (let k = 1; k < p.length; k++) c += Math.max(0, heightAt(p[k]) - heightAt(p[k - 1])) * R.climb;
    p.cost = c;
  }
  return p.cost;
}

// one binary heap in typed arrays, shared by costsFrom and findRoute (never nested).
// Same sift rules as a plain array heap, so ties pop in the same order
const HEAP = { k: new Float64Array(1024), v: new Int32Array(1024), n: 0 };
function heapReset() { HEAP.n = 0; }
function heapPush(key, val) {
  if (HEAP.n === HEAP.k.length) {
    const k = new Float64Array(HEAP.n * 2), v = new Int32Array(HEAP.n * 2);
    k.set(HEAP.k); v.set(HEAP.v); HEAP.k = k; HEAP.v = v;
  }
  const K = HEAP.k, V = HEAP.v;
  let i = HEAP.n++;
  K[i] = key; V[i] = val;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (K[p] <= K[i]) break;
    const tk = K[p]; K[p] = K[i]; K[i] = tk; const tv = V[p]; V[p] = V[i]; V[i] = tv;
    i = p;
  }
}
function heapPop() {
  const K = HEAP.k, V = HEAP.v, top = V[0], n = --HEAP.n;
  if (n) {
    K[0] = K[n]; V[0] = V[n];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < n && K[l] < K[m]) m = l;
      if (r < n && K[r] < K[m]) m = r;
      if (m === i) break;
      const tk = K[m]; K[m] = K[i]; K[i] = tk; const tv = V[m]; V[m] = V[i]; V[i] = tv;
      i = m;
    }
  }
  return top;
}

// -------------------------------------------------------------- production

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function treesNear(x, y, r = R.cutterRadius) {
  let n = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (isTree(x + i, y + j)) n++;
  return n;
}
const around = (x, y, test) => { let n = 0; for (const [dx, dy] of RING) if (inMap(x + dx, y + dy) && test(x + dx, y + dy)) n++; return n; };
const rocksBeside = (x, y) => around(x, y, isRock) + around(x, y, (i, j) => feat(i, j) === "k"); // a boulder counts twice
const marshBeside = (x, y) => around(x, y, (i, j) => S.soil[idx(i, j)] === "w" || S.soil[idx(i, j)] === "W");
// open grass for a flock within 2 tiles, and sandbars for a tide pier's gatherers
function grassNear(x, y) {
  let n = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const k = idx(x + i, y + j);
    if ((i || j) && inMap(x + i, y + j) && S.ground[k] === "." && S.feat[k] === "." && !bAt(x + i, y + j) && S.cob[k] !== "1" && S.soil[k] !== "L") n++;
  }
  return n;
}
function sandbarsNear(x, y) {
  let n = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (ground(x + i, y + j) === "_") n++;
  return n;
}
const fieldsBeside = (x, y) => DIRS.filter(([dx, dy]) => { const o = bAt(x + dx, y + dy); return o && o.t === "field" && !o.site; }).length;

// what each worker adds, rested (markets and taverns depend on the day's
// walking and workshops on wood, so plan() works those out)
// The seasons bend fields (weather.js): summer meadows +1, the harvest x1.5, and in
// winter they rest
function shares(t, x, y) {
  if (t === "field") {
    const X = wx();
    if (X.winter) return [0, 0];
    const a = [2 + (meadow(x, y) ? 2 + (X.summer ? 1 : 0) : 0) + Math.min(2, fieldsBeside(x, y)) + R.fieldBonus, 1];
    return X.harvest ? a.map(v => v * HARVEST.times) : a;
  }
  if (t === "lodge") { const k = wx().winter ? 3 : 2; return [k, k]; }
  if (t === "shepherd") return [Math.min(3, Math.floor(grassNear(x, y) / 2))];
  if (t === "pier") { const a = Math.min(4, sandbarsNear(x, y)) * (wx().tide ? 2 : 1); return [a, Math.floor(a / 2)]; }
  if (t === "woodcutter") { const a = Math.min(4, Math.floor(treesNear(x, y) / 2)); return [a, Math.floor(a / 2)]; }
  if (t === "fisher") return R.fisherOut.slice();
  if (t === "workshop") return Array(BD.workshop.jobs).fill(R.goods.perWood);
  if (t === "quarry") { const a = Math.min(3, rocksBeside(x, y)); return [a, Math.floor(a / 2)]; }
  if (t === "claypit") { const a = Math.min(3, marshBeside(x, y)); return [a, Math.floor(a / 2)]; }
  if (t === "ferry") return [2, 1]; // pearl divers
  return [];
}
// a building's output with every job filled
const baseOutput = (t, x, y) => shares(t, x, y).reduce((a, b) => a + b, 0);
const tiredBy = commute => (commute > R.tired[1] ? 2 : commute > R.tired[0] ? 1 : 0);

// the coast in stretches of about R.stretch.len shore tiles; fishers on one stretch
// share its fish.  Only the sea shapes it, so it is worked out once per island
let stretchCache = { ground: null, of: null };
function stretchOf(x, y) {
  if (stretchCache.ground !== S.ground) {
    const of = new Int32Array(N * N).fill(-1), shore = i => ground(i % N, (i / N) | 0) === "." && coastal(i % N, (i / N) | 0);
    let id = 0;
    for (let s = 0; s < N * N; s++) {
      if (of[s] >= 0 || !shore(s)) continue;
      // walk the shoreline breadth-first and cut it into runs
      const order = [s], seen = new Set([s]);
      for (let k = 0; k < order.length; k++) {
        const i = order[k], x0 = i % N, y0 = (i / N) | 0;
        for (const [dx, dy] of RING) {
          const nx = x0 + dx, ny = y0 + dy, j = idx(nx, ny);
          if (inMap(nx, ny) && !seen.has(j) && shore(j)) { seen.add(j); order.push(j); }
        }
      }
      const runs = Math.max(1, Math.round(order.length / R.stretch.len));
      order.forEach((i, k) => (of[i] = id + Math.min(runs - 1, Math.floor((k * runs) / order.length))));
      id += runs;
    }
    stretchCache = { ground: S.ground, of };
  }
  return stretchCache.of[idx(x, y)];
}

// how many jobs a workplace has open today: only jobs that would add something.
// Markets and taverns take on keepers as trade grows (one per `serve` customers
// they had yesterday); a fisher's second hand only while its coast has fish to
// spare; a woodcutter's second only where there are trees enough
// Weather closes some: fields rest in winter or stand in a flood (`flood`, plan()'s),
// fishers stay ashore in a storm
const jobsOf = t => R.jobs[t] || BD[t].jobs;
// the fish a stretch of coast holds: more on the Storm coast's rich shoals
const stretchFish = () => R.stretch.fish + (S.traits.includes("storm") ? R.stormFish : 0);
function openJobs(b, flood = null) {
  const def = BD[b.t], X = wx();
  if (def.serve) return Math.max(1, Math.min(jobsOf(b.t), Math.ceil((b.demand || 0) / R.serve[b.t])));
  if (b.t === "harbour") return boatsDue().length && !X.storm ? jobsOf(b.t) : 0; // dockers only on boat days
  if (b.t === "woodcutter") return Math.max(1, shares(b.t, b.x, b.y).filter(a => a > 0).length);
  if (b.t === "field" && (X.winter || (flood && flood[idx(b.x, b.y)]))) return 0;
  if (b.t === "fisher") {
    if (X.storm) return 0;
    const st = stretchOf(b.x, b.y), mates = S.b.filter(o => o.t === "fisher" && !o.site && stretchOf(o.x, o.y) === st);
    let left = stretchFish() - mates.length * R.fisherOut[0];
    for (const o of mates) { if (o === b) return left >= R.fisherOut[1] ? 2 : 1; left -= R.fisherOut[1]; }
  }
  if (b.t === "pier" || b.t === "shepherd") return Math.max(1, shares(b.t, b.x, b.y).filter(a => a > 0).length);
  return jobsOf(b.t);
}

// tribute boats: each settled island (save.js's W.islands) sends one every
// TRIBUTE_EVERY days, staggered, with its load and a settler; boats kept back by a
// storm or the serpent (S.late, their nodes) come the day after
function boatsDue() {
  if (!W || !W.islands.length) return [];
  const late = S.late || [];
  return W.islands.filter((isl, k) => late.includes(isl.node) || (S.day + k) % TRIBUTE_EVERY === 0);
}

// where a shepherd's flock may graze: open grass 2-3 tiles from the hut, the most
// grass round it first (plan() takes the first it can walk to)
function pastures(b) {
  const out = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const x = b.x + i, y = b.y + j, d = Math.max(Math.abs(i), Math.abs(j));
    if (d < 2 || !walkable(x, y)) continue;
    out.push([around(x, y, (u, v) => walkable(u, v) && level(idx(u, v)) < 2) * 2 + d - level(idx(x, y)) * 3, idx(x, y)]);
  }
  return out.sort((a, c) => c[0] - a[0] || a[1] - c[1]).map(p => p[1]);
}

// ------------------------------------------------------------------- plan

function plan() {
  routeMemo = new Map();
  stepGrid = null; stepGrid = steps();
  try { return planDay(); } finally { routeMemo = null; stepGrid = null; }
}
function planDay() {
  const X = wx();
  const P = { jobs: {}, crew: {}, walks: [], out: {}, foot: new Array(N * N).fill(0), graze: null, flocks: [],
    make: { food: 0, wood: 0, coin: 0, goods: 0, stone: 0, clay: 0, wool: 0, pearl: 0 }, use: { wood: 0, goods: 0, clay: 0, wool: 0, pearl: 0 }, needs: {}, stalls: [],
    tribute: { boats: 0, load: {}, late: [] }, weather: X, flood: null, rise: null, refund: {},
    // moments (events.js): an event found today, a herd crossing, the merchant's sail, the feast
    event: null, herds: [], merchant: null, feast: feastToday() };
  const hearth = S.b.find(b => b.t === "hearth");
  const homes = new Map(S.vil.map(v => [v.id, (bById(v.home) && isHome(bById(v.home)) && bById(v.home)) || hearth]));
  // a storm floods the low shore: fields there make nothing today
  const flood = X.storm ? floodTiles() : null;
  if (flood) P.flood = flood;
  const costCache = new Map();
  const costsHome = h => { if (!costCache.has(h.id)) costCache.set(h.id, costsFrom(h.x, h.y)); return costCache.get(h.id); };

  // jobs: the closest villager-workplace pairs are matched first.  Every workplace
  // fills its first job before any takes a second (then a third), so a second
  // woodcutter never leaves a field empty.  The building sites get their builders
  // between the first jobs and the second, so a busy village still raises what it
  // starts.  Everyone is re-chosen each morning, so workers drift to better jobs
  // as paths change
  const work = S.b.filter(b => BD[b.t].jobs && !b.site);
  const staff = new Map(work.map(b => [b.id, []])), slots = new Map(work.map(b => [b.id, openJobs(b, flood)]));
  const pairs = [];
  for (const v of S.vil) {
    const d = costsHome(homes.get(v.id));
    for (const b of work) { const c = d[idx(b.x, b.y)]; if (c < Infinity) pairs.push([c, v.id, b.id]); }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const most = Math.max(0, ...slots.values());
  const matchRound = round => { for (const [, vid, bid] of pairs) {
    const st = staff.get(bid);
    if (P.jobs[vid] || P.crew[vid] || st.length >= Math.min(round, slots.get(bid))) continue;
    P.jobs[vid] = bid; st.push(vid);
  } };
  if (most >= 1) matchRound(1);

  // builders: whoever is still free goes to the building sites, nearest first,
  // as many as a site can use
  const sites = S.b.filter(b => b.site > 0);
  const crews = new Map(sites.map(b => [b.id, 0]));
  if (sites.length) {
    const sp = [];
    for (const v of S.vil) {
      if (P.jobs[v.id]) continue;
      const d = costsHome(homes.get(v.id));
      for (const b of sites) { const c = d[idx(b.x, b.y)]; if (c < Infinity) sp.push([c, v.id, b.id]); }
    }
    sp.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [, vid, bid] of sp) {
      const s = bById(bid);
      if (P.crew[vid] || crews.get(bid) >= Math.min(R.siteCrew, s.site)) continue;
      P.crew[vid] = bid; crews.set(bid, crews.get(bid) + 1);
    }
  }
  for (let round = 2; round <= most; round++) matchRound(round);

  // routes: home -> work in the morning.  In the evening, work -> a tavern within
  // tavernReach, or else the hearth within hearthReach -> home.  Villagers
  // without work spend the day at the hearth.  On a feast day everyone goes to the
  // hearth after work, however far
  const taverns = work.filter(b => b.t === "tavern" && staff.get(b.id).length);
  const guests = new Map(taverns.map(t => [t.id, 0]));
  for (const v of S.vil) {
    const busy = P.jobs[v.id] || P.crew[v.id];
    const h = homes.get(v.id), job = busy ? bById(busy) : hearth;
    if (h === job) continue;
    const am = route(h.x, h.y, job.x, job.y);
    if (!am) continue;
    let pm = am.slice().reverse(), stop = null;
    if (busy && P.feast) {
      const r = hearth !== h && route(job.x, job.y, hearth.x, hearth.y), back = r && route(hearth.x, hearth.y, h.x, h.y);
      if (back) { pm = r.concat(back.slice(1)); stop = hearth; }
    } else if (busy && job.t !== "tavern") {
      let best = null;
      for (const t of taverns) {
        const r = route(job.x, job.y, t.x, t.y);
        if (r && routeCost(r) <= R.tavernReach && (!best || routeCost(r) < routeCost(best[1]))) best = [t, r];
      }
      if (!best && hearth !== h) {
        const r = route(job.x, job.y, hearth.x, hearth.y);
        if (r && routeCost(r) <= R.hearthReach) best = [hearth, r];
      }
      const back = best && route(best[0].x, best[0].y, h.x, h.y);
      if (back) {
        pm = best[1].concat(back.slice(1));
        stop = best[0];
        if (stop.t === "tavern") guests.set(stop.id, guests.get(stop.id) + 1);
      }
    }
    P.walks.push({ v: v.id, am, pm, job: job.id, commute: routeCost(am), stop: stop ? stop.id : null,
      inn: stop && stop.t === "tavern" ? stop.id : null, build: !!P.crew[v.id] });
  }

  // footfall: every step on a tile (not counting doors)
  for (const w of P.walks) for (const r of [w.am, w.pm]) for (let k = 1; k < r.length - 1; k++) P.foot[r[k]]++;

  // the Highlands' flocks graze out and back with their shepherd, trampling a trail
  // (their steps wear the ground but buy nothing at a stall)
  for (const b of work) {
    if (b.t !== "shepherd" || !staff.get(b.id).length) continue;
    let r = null;
    for (const at of pastures(b).slice(0, 4)) if ((r = route(b.x, b.y, at % N, (at / N) | 0))) break;
    if (!r) continue;
    P.graze = P.graze || new Array(N * N).fill(0);
    for (let k = 1; k < r.length; k++) P.graze[r[k]] += 2; // there and back
    P.flocks.push({ b: b.id, route: r, n: R.flock });
  }
  // the event under way (found by today's walks? a herd crossing), the merchant's sail
  eventPlan(P);

  // who passes which market: tiles within reach of each staffed market
  const nearMarket = new Map(), grands = new Set();
  for (const b of work) {
    if ((b.t !== "market" && b.t !== "grandmarket") || !staff.get(b.id).length) continue;
    const r = b.t === "grandmarket" ? R.grandReach : R.marketReach;
    if (b.t === "grandmarket") grands.add(b.id);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (!inMap(b.x + i, b.y + j)) continue;
      const k = idx(b.x + i, b.y + j);
      if (!nearMarket.has(k)) nearMarket.set(k, []);
      nearMarket.get(k).push(b.id);
    }
  }
  const passers = new Map(), shops = new Map(), hall = new Set(); // market -> passers; villager -> markets passed; who passed a grand market
  for (const w of P.walks) {
    const seen = new Set();
    for (const r of [w.am, w.pm]) for (let k = 1; k < r.length - 1; k++) for (const m of nearMarket.get(r[k]) || []) seen.add(m);
    for (const m of seen) { passers.set(m, (passers.get(m) || 0) + 1); if (grands.has(m)) hall.add(w.v); }
    shops.set(w.v, seen.size > 0);
  }
  // the Atoll's ferry: walks that cross the water on a lane
  P.ferried = 0;
  if (S.soil.includes("f")) for (const w of P.walks) if (w.am.some(i => S.soil[i] === "f")) P.ferried += 2;
  P.shops = Object.fromEntries(shops);

  // production: each worker adds a share, less their tiredness
  const walkOf = new Map(P.walks.map(w => [w.v, w]));
  const tiredOf = vid => { const w = walkOf.get(vid); return w ? tiredBy(w.commute) : 0; };
  const served = (n, per, k) => Array.from({ length: k }, (_, i) => Math.max(0, Math.min(per, n - i * per)));
  const workshops = [];
  for (const b of work) {
    const ws = staff.get(b.id), def = BD[b.t];
    let sh, base;
    if (b.t === "market" || b.t === "grandmarket") { base = passers.get(b.id) || 0; sh = served(base, R.serve[b.t], ws.length); }
    else if (b.t === "tavern") { base = guests.get(b.id) || 0; sh = served(base, R.serve.tavern, ws.length); }
    else { sh = shares(b.t, b.x, b.y).slice(0, ws.length); base = sh.reduce((a, c) => a + c, 0); }
    const tired = ws.map(tiredOf);
    const amt = sh.reduce((a, c, i) => a + Math.max(0, c - tired[i]), 0);
    const walks = ws.map(vid => walkOf.get(vid)).filter(Boolean);
    P.out[b.id] = { res: def.res || null, amt, base, tired: tired.reduce((a, c) => a + c, 0), workers: ws.slice(), slots: slots.get(b.id),
      worker: ws.length ? ws[0] : null, commute: walks.length ? Math.max(...walks.map(w => w.commute)) : 0 };
    if (b.t === "workshop") workshops.push(b);
  }
  // what the weather stopped: flooded fields, fishers kept ashore
  for (const b of work) {
    if (flood && flood[idx(b.x, b.y)]) P.out[b.id].flooded = true;
    if (X.storm && b.t === "fisher") P.out[b.id].ashore = true;
    if (X.winter && b.t === "field") P.out[b.id].resting = true;
  }
  // gulls raid the shore fields nobody else walks past: half the crop
  if (X.rules && !X.storm) for (const b of work) {
    const o = P.out[b.id];
    if (b.t !== "field" || !o.amt || !around(b.x, b.y, seaAt)) continue;
    let feet = 0;
    for (const [dx, dy] of [[0, 0], ...RING]) if (inMap(b.x + dx, b.y + dy)) feet += P.foot[idx(b.x + dx, b.y + dy)];
    for (const vid of o.workers) { const w = walkOf.get(vid); if (w) for (const r of [w.am, w.pm]) for (let k = 1; k < r.length - 1; k++) if (cheb({ x: r[k] % N, y: (r[k] / N) | 0 }, b) <= 1) feet--; }
    if (feet > 0) continue;
    o.gulls = Math.ceil(o.amt / 2); o.amt -= o.gulls;
  }
  // fishers on one stretch of coast share its fish: the catch is cut back in
  // proportion, the rounding going to the oldest fisher first
  const byStretch = new Map();
  for (const b of work) if (b.t === "fisher" && P.out[b.id].amt) {
    const s = stretchOf(b.x, b.y);
    if (!byStretch.has(s)) byStretch.set(s, []);
    byStretch.get(s).push(b);
  }
  for (const [s, fs] of byStretch) {
    const want = fs.reduce((a, b) => a + P.out[b.id].amt, 0), cap = stretchFish();
    for (const b of fs) P.out[b.id].stretch = { id: s, fishers: fs.length, want, cap };
    if (want <= cap) continue;
    const got = fs.map(b => Math.floor((P.out[b.id].amt * cap) / want));
    let left = cap - got.reduce((a, c) => a + c, 0);
    fs.forEach((b, i) => { if (left > 0 && got[i] < P.out[b.id].amt) { got[i]++; left--; } });
    fs.forEach((b, i) => { P.out[b.id].short = P.out[b.id].amt - got[i]; P.out[b.id].amt = got[i]; });
  }
  for (const b of work) if (b.t !== "workshop" && P.out[b.id].res) P.make[P.out[b.id].res] += P.out[b.id].amt;
  // workshops turn clay, then wool, then wood into goods while it lasts (leaving a
  // little wood in store)
  let wood = S.wood + P.make.wood - R.woodKeep, clay = S.clay + P.make.clay, wool = S.wool + P.make.wool;
  for (const b of workshops) {
    const o = P.out[b.id], ws = o.workers;
    let amt = 0;
    ws.forEach(vid => {
      if (clay >= 1) { clay--; P.use.clay++; }
      else if (wool >= 1) { wool--; P.use.wool++; }
      else if (wood >= 1) { wood--; P.use.wood++; }
      else { o.noWood = true; return; }
      amt += Math.max(0, R.goods.perWood - tiredOf(vid));
    });
    o.amt = amt; o.base = ws.length * R.goods.perWood;
    P.make.goods += amt;
  }
  // markets sell the Atoll's pearls to their passers-by (one for every few)
  let pearls = S.pearl + P.make.pearl;
  if (pearls > 0) for (const b of work) {
    if ((b.t !== "market" && b.t !== "grandmarket") || !staff.get(b.id).length) continue;
    const n = Math.min(pearls, Math.floor((passers.get(b.id) || 0) / R.pearl.per));
    if (!n) continue;
    pearls -= n; P.use.pearl += n; P.make.coin += n * R.pearl.price; P.out[b.id].pearls = n;
  }
  // street stalls earn from the feet on their tile
  for (let i = 0; i < N * N; i++) if (S.deco[i] === "s") {
    const c = Math.min(4, Math.floor(P.foot[i] / 3));
    P.stalls.push([i, c]);
    P.make.coin += c;
  }

  // houses: the extra beds open while their people pass a staffed market (and
  // there are goods to buy: R.goods.perResident a night) and meet in the
  // evening (tavern, hearth, a bench on the way home, or idle by the fire)
  const houses = S.b.filter(b => b.t === "house");
  if (houses.length) {
    const benchAt = i => S.deco[i] === "b";
    const company = w => !!w.stop || w.job === hearth.id || w.pm.some(benchAt) || hall.has(w.v);
    let stock = S.goods + P.make.goods;
    for (const h of houses) {
      const res = S.vil.filter(v => v.home === h.id), ws = res.map(v => walkOf.get(v.id));
      const market = res.some(v => shops.get(v.id)), meet = ws.some(w => w && company(w));
      const need = res.length * R.goods.perResident;
      const goods = market && res.length > 0 && stock >= need;
      if (goods) { stock -= need; P.use.goods += need; }
      P.needs[h.id] = { market, goods, company: meet, met: goods && meet, need };
    }
  }

  // night: everyone eats, then newcomers settle while there is food and a bed.
  // One comes each night; a cheerful tavern, a tended lighthouse and a village
  // where nearly everyone worked ("word spreads") each invite one more
  const n = pop();
  const food = S.food + P.make.food - n;
  P.eat = n;
  P.hungry = food < 0;
  // Wild: tonight the sea rises (the first night of winter): what stands on the
  // outer shore is refunded, its people move to free beds
  const lost = new Set();
  if (X.rise) {
    P.rise = risingTiles();
    const add = c => { for (const r in c) P.refund[r] = (P.refund[r] || 0) + c[r]; };
    for (const i of P.rise) {
      const b = byTile.get(i);
      if (b) { lost.add(b.id); add(b.to ? BD[b.to].cost : b.t === "ship" ? costOf(BD.ship) : BD[b.t].cost); }
      if (DECO[S.deco[i]]) add(DECO[S.deco[i]].cost);
    }
  }
  let spare = Math.max(0, food), beds = 0, slotsN = 1;
  for (const b of S.b) if (isHome(b) && !lost.has(b.id)) beds += Math.max(0, bedsOf(b, P.needs) - residents(b.id));
  // the homeless (their home gone to the sea) take the free beds first
  // (castaways found today join them)
  P.homeless = S.vil.filter(v => { const h = bById(v.home); return !h || !isHome(h) || lost.has(h.id); }).length + (P.event ? P.event.join : 0);
  beds = Math.max(0, beds - P.homeless);
  P.cheer = taverns.some(t => guests.get(t.id) >= R.tavernCheer);
  P.lit = work.some(b => b.t === "lighthouse" && staff.get(b.id).length);
  // the town hall's clerks write to the other islands: one more newcomer
  P.hall = work.some(b => b.t === "townhall" && staff.get(b.id).length);
  P.worked = Object.keys(P.jobs).length + Object.keys(P.crew).length;
  P.idle = n - P.worked;
  P.word = n >= R.word.pop && P.worked >= R.word.share * n;
  // tribute boats bring their island's load (a third without a harbour's dockers,
  // all of it with four) and a settler each.  A storm keeps them all back a day,
  // the serpent one of them, unless the lighthouse is lit
  let boats = boatsDue();
  const harbour = work.find(b => b.t === "harbour");
  if (boats.length && X.storm) { P.tribute.late = boats; boats = []; }
  else if (boats.length && X.serpent && !P.lit) { P.tribute.late = [boats[0]]; boats = boats.slice(1); P.serpent = true; }
  if (boats.length) {
    const dockers = harbour ? staff.get(harbour.id).length : 0, share = 1 / 3 + (2 / 3) * Math.min(1, dockers / jobsOf("harbour"));
    for (const isl of boats) for (const r in isl.tribute) if (RES.includes(r)) P.tribute.load[r] = (P.tribute.load[r] || 0) + Math.floor(isl.tribute[r] * share * tradeMult(isl));
    P.tribute.boats = boats.length; P.tribute.from = boats.map(b => b.name); P.tribute.share = share;
  }
  slotsN += (P.cheer ? 1 : 0) + (P.lit ? 1 : 0) + (P.word ? 1 : 0) + (P.hall ? 1 : 0) + P.tribute.boats;
  if (X.storm) slotsN = 0; // no boat puts out in a storm: newcomers wait
  P.arrive = 0;
  while (slotsN > 0 && beds > 0 && spare >= R.arriveFood) { slotsN--; beds--; spare -= R.arriveFood; P.arrive++; }
  const T = P.tribute.load, F = P.refund, G = P.event ? P.event.gift : {};
  P.delta = { food: P.make.food - n - P.arrive * R.arriveFood + (T.food || 0), wood: P.make.wood - P.use.wood + (T.wood || 0) + (F.wood || 0) + (G.wood || 0),
    coin: P.make.coin + (T.coin || 0) + (F.coin || 0) + (G.coin || 0), goods: P.make.goods - P.use.goods + (T.goods || 0),
    stone: P.make.stone + (T.stone || 0) + (F.stone || 0), clay: P.make.clay - P.use.clay + (T.clay || 0),
    wool: P.make.wool - P.use.wool + (T.wool || 0), pearl: P.make.pearl - P.use.pearl + (T.pearl || 0) };
  if (P.hungry) P.delta.food = -S.food + (T.food || 0);
  // letters: a boat from an island that asked for something takes it home, if the
  // village has it tonight (at a harbour); the island sends back a double load
  P.letters = [];
  if (boats.length && harbour) for (const isl of boats) {
    const a = isl.trade && isl.trade.ask;
    if (!a || S.day > a.until || (S[a.res] || 0) + P.delta[a.res] < a.n) continue;
    const gift = {};
    for (const r in isl.tribute) if (RES.includes(r)) gift[r] = isl.tribute[r] * 2;
    P.letters.push({ node: isl.node, name: isl.name, res: a.res, n: a.n, gift });
    P.delta[a.res] -= a.n;
    for (const r in gift) P.delta[r] += gift[r];
  }
  // building sites: the day's labour, and the ones it finishes
  P.labour = Object.fromEntries([...crews].filter(([, c]) => c).map(([id, c]) => [id, c * R.builderRate]));
  P.finish = sites.filter(b => (P.labour[b.id] || 0) >= b.site).map(b => b.id);
  P.guests = guests;
  return P;
}

// ------------------------------------------------------------ apply a day

// production lands at midday; workshops use their wood then
function applyWork(P) {
  S.food += P.make.food; S.wood += P.make.wood - P.use.wood; S.coin += P.make.coin; S.goods += P.make.goods;
  S.pearl += P.make.pearl - P.use.pearl; S.stats.pearls = (S.stats.pearls || 0) + P.make.pearl;
  S.stone += P.make.stone; S.clay += P.make.clay - P.use.clay; S.wool += P.make.wool - P.use.wool;
  S.stats.coins += P.make.coin;
  S.stats.stone = (S.stats.stone || 0) + P.make.stone; S.stats.clay = (S.stats.clay || 0) + P.make.clay;
  S.stats.wool = (S.stats.wool || 0) + P.make.wool;
}

// night: eat, use goods, raise the sites, settle newcomers, wear the paths
function applyNight(P) {
  const X = P.weather;
  S.food = Math.max(0, S.food - P.eat);
  S.goods = Math.max(0, S.goods - P.use.goods);
  for (const r in P.tribute.load) S[r] += P.tribute.load[r];
  S.stats.tribute = (S.stats.tribute || 0) + P.tribute.boats;
  S.late = P.tribute.late.map(isl => isl.node);
  for (const L of P.letters || []) {
    S[L.res] -= L.n;
    for (const r in L.gift) S[r] += L.gift[r];
    const isl = W.islands.find(i => i.node === L.node);
    isl.trade.level = Math.min(LETTER.top, isl.trade.level + 1); isl.trade.done = (isl.trade.done || 0) + 1; isl.trade.ask = null;
    S.stats.letters = (S.stats.letters || 0) + 1;
    chron("letter", `${L.name}'s boat takes *${L.n} ${L.res}* home: trade with it grows to level ${isl.trade.level}.`);
  }
  S.stats.ferried = (S.stats.ferried || 0) + (P.ferried || 0);
  // what the day's moments did: an event found (its gift, castaways), the feast's scar
  eventNight(P);
  if (P.rise) riseSea(P);
  // the weather's charters: fields kept dry through a storm, a winter fed
  if (X.storm && S.b.some(b => b.t === "field") && !S.b.some(b => b.t === "field" && P.flood[idx(b.x, b.y)])) S.stats.dryStorms = (S.stats.dryStorms || 0) + 1;
  if (X.winter && !P.hungry) S.stats.fedWinter = (S.stats.fedWinter || 0) + 1;
  if (X.storm) chron("weather", "A storm floods the shore.");
  if (X.harvest) chron("weather", "The harvest: fields bring in threefold.");
  if (X.snow && X.sday === 0) chron("weather", "Winter comes.");
  for (const b of S.b) {
    if (b.t === "house") b.met = !!(P.needs[b.id] && P.needs[b.id].met);
    if (BD[b.t].serve && P.out[b.id]) b.demand = P.out[b.id].base; // tomorrow's keepers
    if (!b.site || !P.labour[b.id]) continue;
    b.site = Math.max(0, b.site - P.labour[b.id]);
    if (b.site) continue;
    delete b.site;
    if (b.to) { b.t = b.to; delete b.to; b.met = false; }
    S.stats.raised = (S.stats.raised || 0) + 1;
    if (b.t !== "house") chron("built", `The *${BD[b.t].name.toLowerCase()}* is built.`);
  }
  // the homeless move into free beds before any newcomer
  for (const v of S.vil) {
    const h = bById(v.home);
    if (h && isHome(h)) continue;
    const home = S.b.filter(b => isHome(b) && residents(b.id) < bedsOf(b, P.needs)).sort((a, b) => a.id - b.id)[0];
    if (home) v.home = home.id;
  }
  const arrived = [];
  for (let k = 0; k < P.arrive; k++) {
    const home = S.b.filter(b => isHome(b) && residents(b.id) < bedsOf(b, P.needs)).sort((a, b) => a.id - b.id)[0];
    if (!home) break;
    S.food -= R.arriveFood;
    arrived.push(addVillager(S, home.id));
    S.stats.arrived++;
  }
  // wear: sand (the Tidal isle's dunes) wears in faster; the flock's steps count too.
  // Cobbles nobody has trodden for weeks (their wear gone) grow over into a path,
  // which grows back into grass if it stays unused.  Ghost paths never grow back
  const cob = S.cob.split("");
  for (let i = 0; i < N * N; i++) {
    if (S.ground[i] === "~") { S.wear[i] = 0; continue; } // a ferry's wake leaves no path
    const steps = (P.foot[i] + (P.graze ? P.graze[i] : 0)) * (S.soil[i] === "a" ? R.sandWear : 1);
    S.wear[i] = S.wear[i] * R.wear.decay + steps;
    if (S.wear[i] < 0.05) S.wear[i] = 0;
    if (S.ghost[i] === "1" && S.wear[i] < R.wear.trail) S.wear[i] = R.wear.trail;
    if (S.wear[i] >= R.wear.cobble) cob[i] = "1";
    else if (cob[i] === "1" && S.wear[i] === 0 && S.deco[i] === ".") { cob[i] = "0"; S.wear[i] = R.wear.path; S.stats.overgrown = (S.stats.overgrown || 0) + 1; }
  }
  S.cob = cob.join("");
  restoreRuins();
  checkShapes();
  S.foot = P.foot.slice();
  // an islet is reached once a trail runs onto it (the Tidal isle's charter)
  if (S.islets) S.stats.islets = Math.max(S.stats.islets || 0, S.islets.filter(([x, y]) =>
    [[0, 0], ...RING].some(([dx, dy]) => inMap(x + dx, y + dy) && S.ground[idx(x + dx, y + dy)] === "." && level(idx(x + dx, y + dy)) > 0)).length);
  for (const b of S.b) b.age++;
  // the chronicle marks every 25 villagers, the first time
  if (Math.floor(pop() / 25) > Math.floor((S.stats.peak || 0) / 25)) chron("arrive", `The village reaches *${Math.floor(pop() / 25) * 25}* villagers.`);
  S.stats.peak = Math.max(S.stats.peak || 0, pop());
  histRow(P);
  S.day++;
  reindex();
  // the new day: the merchant's stall, and perhaps the deck's next event; letters from home
  eventDawn(P);
  if (typeof lettersMorning === "function") lettersMorning();
  return arrived;
}

// the chronicle's row for the day just played (stats.js)
function histRow(P) {
  const lv = [0, 0, 0, 0];
  for (let i = 0; i < N * N; i++) if (S.ground[i] === ".") lv[level(i)]++;
  const row = { day: S.day, pop: pop(), beds: totalBeds(P.needs), food: S.food, wood: S.wood, coin: S.coin, goods: S.goods, idle: P.idle, cob: lv[3], path: lv[2], trail: lv[1] };
  if (!S.hist) S.hist = [];
  S.hist.push(HIST_KEYS.map(k => row[k]));
  if (S.hist.length > HIST_MAX) S.hist.splice(0, S.hist.length - HIST_MAX);
}

// Wild: the outer shore goes under.  Whatever stood there is refunded in full
// (P.refund, in the forecast); its people are homeless until a bed is free
function riseSea(P) {
  const g = S.ground.split(""), f = S.feat.split(""), so = S.soil.split(""), c = S.cob.split(""), d = S.deco.split("");
  for (const i of P.rise) {
    g[i] = "~"; f[i] = "."; so[i] = "."; c[i] = "0"; d[i] = "."; S.wear[i] = 0;
    const b = byTile.get(i);
    if (b) S.b = S.b.filter(o => o !== b);
  }
  Object.assign(S, { ground: g.join(""), feat: f.join(""), soil: so.join(""), cob: c.join(""), deco: d.join("") });
  for (const r in P.refund) S[r] += P.refund[r];
  S.stats.risen = (S.stats.risen || 0) + P.rise.length;
  reindex();
  layLanes();
  chron("weather", `The sea rises: *${P.rise.length}* tiles of shore go under.`);
}

// a ruin with cobbles beside it is restored: a relic, and coins
function restoreRuins() {
  for (let i = 0; i < N * N; i++) {
    if (S.feat[i] !== "u") continue;
    const x = i % N, y = (i / N) | 0;
    if (!DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && S.cob[idx(x + dx, y + dy)] === "1")) continue;
    setChar("feat", x, y, "U");
    S.coin += 25; S.stats.restored = (S.stats.restored || 0) + 1;
    (S.restoredNow = S.restoredNow || []).push(i);
  }
}

// milestones reached by the current population; returns the ones just passed.
// Chapter 1 climbs MILESTONES to the festival; later chapters have one goal.
// Either way the goal met unlocks the ship
function checkMilestones() {
  const passed = [];
  if (S.chapter > 1) {
    if (!S.goalMet && pop() >= S.goal) {
      S.goalMet = true;
      passed.push(nextMilestoneAt(S.goal));
      S.feast = S.day;
      if (lastChapter()) { W.voyage.done = true; chron("voyage", `*The Grand Festival*: ${pop()} villagers, and the voyage is complete.`); }
      else chron("festival", `The island's goal: *${S.goal} villagers*. A festival, and the ship can be built.`);
    }
    return passed;
  }
  while (S.ms < MILESTONES.length && pop() >= MILESTONES[S.ms].pop) {
    const m = MILESTONES[S.ms++];
    passed.push(m);
    chron("milestone", m.festival ? `*The festival*: ${m.pop} villagers.` : `*${m.pop} villagers*: ` + unlockNames(m).map(n => n.toLowerCase()).join(" and ") + ".");
  }
  if (!S.goalMet && S.ms >= MILESTONES.length) S.goalMet = true;
  // the day after a festival is a feast (events.js)
  if (passed.some(m => m.festival)) S.feast = S.day;
  return passed;
}
const nextMilestoneAt = p => ({ pop: p, unlock: lastChapter() ? [] : ["ship"], goal: true, festival: true, last: lastChapter() });

// ------------------------------------------------------------- building

// how many a building's price counts: every copy raises it
function owned(def) {
  if (def.id === "grove") return 0;
  if (def.id === "bridge") return (S.ground.match(/#/g) || []).length;
  if (def.deco) return decoCount(def.deco);
  if (def.id === "house") return S.b.filter(b => b.t === "house" || b.to === "house").length;
  if (def.id === "ship") return S.chapter - 1; // each voyage's ship is bigger
  if (def.id === "reclaim") return S.stats.reclaimed || 0;
  if (["boardwalk", "pave", "causeway", "seawall", "longbridge"].includes(def.id)) return 0;
  return count(def.id);
}
// what the next copy of a building costs
function costOf(def) {
  const n = owned(def), c = {};
  for (const r in def.cost) c[r] = def.cost[r] + Math.floor((n * def.cost[r]) / R.costStep);
  if (def.id === "ship") for (const r in def.cost) c[r] = def.cost[r] * S.chapter;
  if (def.id === "townhall") c.coin = def.cost.coin + 150 * (S.chapter - 1);
  if (def.id === "well") c.coin *= R.wellCoin;
  return c;
}
function canAfford(def) { const c = costOf(def); return RES.every(r => (S[r] || 0) >= (c[r] || 0)); }

// why a tile can't take this building, or null if it can
function placeProblem(def, x, y) {
  if (!inMap(x, y)) return "off the island";
  const g = ground(x, y);
  if (def.place === "water") {
    if (g !== "=") return "bridges go on the river";
    return null;
  }
  if (def.place === "sandbar") return g !== "_" ? "causeways go over sandbars" : S.soil[idx(x, y)] === "W" ? "a causeway is here" : null;
  if (def.place === "strait") return g === "#" ? "a bridge is here" : g !== "~" || S.soil[idx(x, y)] !== "c" ? "long bridges cross the strait" : null;
  if (def.place === "sea") {
    if (g !== "~" || S.soil[idx(x, y)] !== ".") return "reclaims open sea";
    if (x < 1 || y < 1 || x > N - 2 || y > N - 2) return "too far out";
    if (feat(x, y) !== ".") return "a sea stack is here";
    // a fisher, pier or harbour keeps at least one tile of water beside it
    const quay = DIRS.map(([dx, dy]) => bAt(x + dx, y + dy)).find(o => o && BD[o.t].place === "coast" &&
      !DIRS.some(([ex, ey]) => (o.x + ex !== x || o.y + ey !== y) && seaAt(o.x + ex, o.y + ey)));
    if (quay) return "the " + BD[quay.t].name.toLowerCase() + " needs this water";
    return DIRS.some(([dx, dy]) => isLand(x + dx, y + dy)) ? null : "must touch the shore";
  }
  if (def.place === "cottage") {
    const b = bAt(x, y);
    if (!b || b.t !== "cottage") return b && b.t === "house" ? "already a house" : "rebuilds a cottage";
    return b.site ? "already being rebuilt" : null;
  }
  if (g !== ".") return g === "#" ? "a bridge is here" : "needs dry land";
  const soil = S.soil[idx(x, y)];
  if (def.place === "marsh") return soil !== "w" ? "boardwalks go over marsh" : feat(x, y) !== "." ? "reeds are in the way" : bAt(x, y) ? "occupied" : null;
  if (soil === "w" || soil === "W") return soil === "W" ? "a boardwalk is here" : "too wet to build on";
  if (soil === "L") return "a sea wall is here";
  if (bAt(x, y)) return "occupied";
  if (feat(x, y) !== ".") return isRock(x, y) ? "a rock is here" : isTree(x, y) ? "a tree is here" : isProp(x, y) ? PROPS[feat(x, y)].name.toLowerCase() + " stands here" : "something grows here";
  if (onSquare(x, y)) return "the hearth square stays open";
  if (def.place === "shore") return !coastal(x, y) ? "sea walls go on the shore" : deco(x, y) ? "something stands here" : null;
  if (def.place === "cobble") {
    if (S.cob[idx(x, y)] !== "1") return "stands on cobbles";
    return deco(x, y) ? "something stands here" : null;
  }
  if (def.place === "pave") return S.cob[idx(x, y)] === "1" ? "already cobbled" : null;
  if (def.id === "quarry" && !rocksBeside(x, y)) return "needs rocks beside it";
  if (def.id === "claypit" && !marshBeside(x, y)) return "needs marsh beside it";
  if (def.id === "pier" && !sandbarsNear(x, y)) return "needs sandbars nearby";
  if (def.id === "shepherd" && grassNear(x, y) < 2) return "needs open grass nearby";
  if (def.id === "ferry" && coastal(x, y) && !ferryLane(x, y)) return "no shore straight across the water";
  if (deco(x, y)) return "the street has " + deco(x, y).name.toLowerCase() + " here";
  if (def.place === "coast" && !coastal(x, y)) return "must be on the shore";
  if (def.unique && count(def.id)) return "only one allowed";
  return null;
}

function build(def, x, y) {
  if (!canAfford(def) || placeProblem(def, x, y)) return false;
  const cost = costOf(def);
  for (const r of RES) S[r] -= cost[r] || 0;
  S.stats.built++;
  if (def.place === "cottage") { Object.assign(bAt(x, y), { to: def.id, site: def.labour }); return true; }
  if (def.deco) { setChar("deco", x, y, def.deco); return true; }
  if (def.place === "marsh") { setChar("soil", x, y, "W"); S.stats.boardwalks = (S.stats.boardwalks || 0) + 1; return true; }
  if (def.place === "sandbar") { setChar("soil", x, y, "W"); S.stats.causeways = (S.stats.causeways || 0) + 1; return true; }
  if (def.place === "shore") { setChar("soil", x, y, "L"); S.stats.seawalls = (S.stats.seawalls || 0) + 1; return true; }
  if (def.place === "strait") { setChar("ground", x, y, "#"); levelWithShore(x, y); S.stats.longbridges = (S.stats.longbridges || 0) + 1; reindex(); return true; }
  // land won from the sea: fresh grass, and the coast moves out
  if (def.place === "sea") { setChar("ground", x, y, "."); levelWithShore(x, y); S.wear[idx(x, y)] = 0; S.stats.reclaimed = (S.stats.reclaimed || 0) + 1; reindex(); layLanes(); return true; }
  // paving lasts like cobbles worn in: it grows over only if nobody walks it for weeks
  if (def.place === "pave") { setChar("cob", x, y, "1"); S.wear[idx(x, y)] = Math.max(S.wear[idx(x, y)], R.wear.cobble); S.stats.paved = (S.stats.paved || 0) + 1; return true; }
  if (def.id === "bridge") setChar("ground", x, y, "#");
  else if (def.id === "grove") { setChar("feat", x, y, "opb"[(x * 3 + y) % 3]); S.stats.planted = (S.stats.planted || 0) + 1; }
  else { const b = addBuilding(S, def.id, x, y); if (def.labour) b.site = def.id === "ship" ? SHIP_LABOUR(S.chapter) : def.labour; }
  if (def.id === "ferry") { S.wear[idx(x, y)] = 0; setChar("cob", x, y, "0"); reindex(); layLanes(); return true; }
  // building over a trodden tile clears it
  S.wear[idx(x, y)] = 0; setChar("cob", x, y, "0");
  reindex();
  return true;
}

// what the clear tool would do on this tile: [label, refund] or null
function clearInfo(x, y) {
  const b = bAt(x, y);
  if (b) {
    if (b.t === "hearth") return null;
    if (b.to) return ["stop rebuilding", 0];
    if (isHome(b) && residents(b.id)) return null;
    if (b.t === "well" && wellNeeded(b)) return null;
    const refund = Math.floor((BD[b.t].cost.wood || 0) / 2); // of the base price
    return [`remove ${b.site ? "building site" : BD[b.t].name.toLowerCase()}`, refund];
  }
  if (deco(x, y)) return [`remove ${deco(x, y).name.toLowerCase()}`, Math.floor((deco(x, y).cost.wood || 0) / 2)];
  if (isTree(x, y)) return ["fell tree", 1];
  // rocks and boulders break up into a little stone (the quarries lose them)
  if (isRock(x, y)) return [feat(x, y) === "k" ? "break up the boulders (+2 stone)" : "break up the rock (+1 stone)", 0];
  if (feat(x, y) === "w") return ["gather driftwood", 2];
  if (isBrush(x, y)) return ["clear " + BRUSH[feat(x, y)], 0];
  // what an event left; not while its moment is still on
  if (isProp(x, y)) return S.ev && S.ev.cur && S.ev.cur.at === idx(x, y) ? null : ["clear the " + PROPS[feat(x, y)].name.toLowerCase(), 1];
  if (ground(x, y) === "#") return [S.soil[idx(x, y)] === "c" ? "remove long bridge" : "remove bridge", 1];
  if (S.soil[idx(x, y)] === "L") return ["remove sea wall", 1];
  if (ground(x, y) === "_" && S.soil[idx(x, y)] === "W") return ["remove causeway", 1];
  return null;
}
const BRUSH = { h: "heather", e: "reeds", g: "gorse", a: "alpine plants", d: "dune grass", c: "shrub" };
// would pulling this well down leave someone without a bed?
function wellNeeded(w) {
  return S.b.some(c => isHome(c) && cheb(c, w) <= R.wellRadius &&
    !S.b.some(o => o !== w && o.t === "well" && cheb(c, o) <= R.wellRadius) &&
    residents(c.id) > bedsOf(c) - 1);
}
function clearTile(x, y) {
  const info = clearInfo(x, y);
  if (!info) return false;
  const b = bAt(x, y);
  if (b && b.to) { delete b.to; delete b.site; }
  else if (b) S.b = S.b.filter(o => o !== b);
  else if (deco(x, y)) setChar("deco", x, y, ".");
  else if (isRock(x, y)) { S.stone += feat(x, y) === "k" ? 2 : 1; setChar("feat", x, y, "."); }
  else if (isTree(x, y) || isBrush(x, y) || isProp(x, y)) setChar("feat", x, y, ".");
  else if (ground(x, y) === "#") setChar("ground", x, y, S.soil[idx(x, y)] === "c" ? "~" : "=");
  else setChar("soil", x, y, ".");
  S.wood += info[1];
  reindex();
  if (b && b.t === "ferry") layLanes();
  return true;
}

// in the Highlands, new ground on the water (a long bridge, reclaimed land) is laid level
// with the lowest land beside it, so it isn't a cliff to climb
function levelWithShore(x, y) {
  if (!S.height) return;
  const hs = DIRS.filter(([dx, dy]) => inMap(x + dx, y + dy) && ".#".includes(ground(x + dx, y + dy)) && !(dx === 0 && dy === 0)).map(([dx, dy]) => +S.height[idx(x + dx, y + dy)]);
  if (hs.length) setChar("height", x, y, String(Math.min(...hs)));
}

// ------------------------------------------------------------- the ferry

// the lane a ferry pier on (x, y) would run: straight out over the water to the nearest
// open shore opposite, at least 2 tiles away.  Its tiles (the water), or null
function ferryLane(x, y) {
  let best = null;
  for (const [dx, dy] of DIRS) {
    const lane = [];
    for (let k = 1; k <= FERRY.reach; k++) {
      const nx = x + dx * k, ny = y + dy * k;
      if (!inMap(nx, ny)) break;
      const i = idx(nx, ny), g = S.ground[i];
      if (g === "~") { if (S.feat[i] !== "." || S.soil[i] === "c") break; lane.push(i); continue; }
      const o = bAt(nx, ny);
      if (lane.length >= 2 && (g === "#" || (g === "." && S.feat[i] === "." && S.soil[i] !== "w" && (!o || o.t === "ferry"))) && (!best || lane.length < best.length)) best = lane;
      break;
    }
  }
  return best;
}
// every pier's lane, laid afresh (a pier built or pulled down, the coast changed)
function layLanes() {
  if (!S.soil.includes("f") && !S.b.some(b => b.t === "ferry")) return;
  const so = S.soil.split("");
  for (let i = 0; i < N * N; i++) if (so[i] === "f") so[i] = ".";
  S.soil = so.join("");
  for (const b of S.b) if (b.t === "ferry") for (const i of ferryLane(b.x, b.y) || []) so[i] = "f";
  S.soil = so.join("");
}
