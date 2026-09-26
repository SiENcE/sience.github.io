/* The island and the village: generation, names, and grid queries.
 *
 * The map is three strings of N*N characters, so the save stays small and
 * readable: ground ("~" sea, "." grass, "=" river, "#" bridge), features
 * ("." none, "o" oak, "p" pine, "b" birch, "r" rock), cobbles ("1" paved),
 * soil ("m" meadow: fertile, fields there make more) and street furniture on
 * cobbles (deco: "s" stall, "b" bench, "l" lamp, "f" flowers; see DECO).
 * Island traits add features ("k" boulders, "h" heather, "e" reeds, "l" willow,
 * "u" ruin, "U" restored ruin, "q" pillar; "j" fir, "n" snowy spruce, "x" wind-bent
 * pine, "g" gorse, "a" alpine plants, "d" dune grass, "w" driftwood, "c" bare shrub,
 * "y" a sea stack out in the sea), soils ("s" scree, "w" marsh, "W" boardwalk or
 * causeway, "a" sand, "i" snowfield, "L" sea wall), ground ("_" a sandbar, dry at a
 * spring tide), a height map (height: "0".."9", the Highlands) and ghost paths
 * (ghost: "1" = an old trail that never grows back).  What the event deck leaves
 * stands as features too (PROPS: "H" hermit's hut, "S" shrine, "B" castaways' camp,
 * "X" a wreck, on a sandbar), and a festival leaves its scar (scar: the tiles, as a list).
 * Phase 5 adds palms "v" and mangroves "z" (the Atoll: a lagoon inside the ring), ferry
 * lanes over the water (soil "f") and the Twin isles' strait (soil "c" on its water; a
 * long bridge is ground "#" there).
 */
"use strict";

// small seeded PRNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (x, y) => y * N + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const RING = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// value noise on a coarse lattice, bilinearly interpolated
function noiseField(r, cell) {
  const g = [], m = Math.ceil(N / cell) + 2;
  for (let i = 0; i < m * m; i++) g.push(r());
  return (x, y) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, s = t => t * t * (3 - 2 * t);
    const v = (i, j) => g[(j % m) * m + (i % m)];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * s(tx);
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
}

// opts: the world's settings (rivers, forest); the defaults give the classic island
function genIsland(seed, opts = {}) {
  const r = rng(seed);
  const n1 = noiseField(r, 5), n2 = noiseField(r, 2.5), nf = noiseField(r, 3), nm = noiseField(r, 3.5);
  const c = (N - 1) / 2;
  const ground = new Array(N * N).fill("~"), feat = new Array(N * N).fill(".");

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot((x - c) / (N * 0.47), (y - c) / (N * 0.47));
    const h = 1.1 - d * 1.05 + (n1(x, y) - 0.5) * 0.6 + (n2(x, y) - 0.5) * 0.25;
    if (h > 0.18 && x > 0 && y > 0 && x < N - 1 && y < N - 1) ground[idx(x, y)] = ".";
  }
  // the village starts on solid ground in the middle
  const hx = Math.round(c), hy = Math.round(c);
  for (let y = hy - 2; y <= hy + 2; y++) for (let x = hx - 2; x <= hx + 2; x++) ground[idx(x, y)] = ".";

  // keep only the land connected to the middle
  const seen = new Set([idx(hx, hy)]), queue = [[hx, hy]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of DIRS) {
      const i = idx(x + dx, y + dy);
      if (inMap(x + dx, y + dy) && ground[i] === "." && !seen.has(i)) { seen.add(i); queue.push([x + dx, y + dy]); }
    }
  }
  for (let i = 0; i < N * N; i++) if (!seen.has(i)) ground[i] = "~";

  // rivers run from coast to coast past the village, so the island comes in parts
  // and bridges open up new land: always one, and often a second the other way.
  // The village's own part keeps 40-70% of the land (so across the water there is
  // real land worth a bridge), or the rivers move
  const dry = ground.slice(), roll = r(), first = r() < 0.5 ? 0 : 1;
  let rivers = roll < 0.65 ? 2 : 1;
  if (opts.rivers && opts.rivers !== "random") rivers = { none: 0, one: 1, two: 2 }[opts.rivers];
  for (let attempt = 0; attempt < 12; attempt++) {
    for (let i = 0; i < N * N; i++) ground[i] = dry[i];
    for (let k = 0; k < rivers; k++) {
      const axis = k ? 1 - first : first;      // 0: flows along x, 1: along y
      const centre = axis ? hx : hy;
      let c = centre + (r() < 0.5 ? -1 : 1) * (4 + Math.floor(r() * 3)), t = 0;
      const wet = cc => { const x = axis ? cc : t, y = axis ? t : cc; if (inMap(x, y) && ground[idx(x, y)] === ".") ground[idx(x, y)] = "="; };
      for (; t < N; t++) {
        wet(c);
        // meander, one step at a time so the banks stay joined, 4 to 7 from the village
        if (r() < 0.35) {
          const nc = c + (r() < 0.5 ? -1 : 1);
          if (Math.abs(nc - centre) >= 4 && Math.abs(nc - centre) <= 7 && nc > 1 && nc < N - 2) { wet(nc); c = nc; }
        }
      }
    }
    const land = ground.filter(g => g !== "~").length, home = new Set([idx(hx, hy)]), q = [[hx, hy]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of DIRS) { const i = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && ground[i] === "." && !home.has(i)) { home.add(i); q.push([x + dx, y + dy]); } }
    }
    if (!rivers || (home.size >= land * 0.4 && home.size <= land * 0.7)) break;
  }

  // forests where the forest noise is high, a few rocks, a clearing round the
  // hearth, and thinner woods near it so the village has room to start
  const woods = FOREST[opts.forest] || FOREST.wooded;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (ground[i] !== ".") continue;
    const near = Math.max(Math.abs(x - hx), Math.abs(y - hy));
    if (near <= 2) continue;
    const f = nf(x, y) - (near <= 4 ? 0.08 : 0);
    if (f > woods.tree && r() < 0.85) feat[i] = f > woods.pine ? "p" : r() < 0.25 ? "b" : "o";
    else if (r() < woods.scatter) feat[i] = r() < 0.4 ? "r" : r() < 0.5 ? "b" : "o";
  }
  // a guaranteed copse within reach of the start, so the first woodcutter has work
  const cx = hx + 3, cy = hy - 2;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1], [1, 1], [-1, -1]]) {
    const i = idx(cx + dx, cy + dy);
    if (inMap(cx + dx, cy + dy) && ground[i] === ".") feat[i] = dx + dy > 0 ? "p" : "o";
  }
  // meadows: fertile patches out of the village's way, where the forest isn't
  const soil = new Array(N * N).fill(".");
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y), near = Math.max(Math.abs(x - hx), Math.abs(y - hy));
    if (ground[i] === "." && near >= 3 && nm(x, y) > 0.6) { soil[i] = "m"; if (feat[i] !== "r" && r() < 0.8) feat[i] = "."; }
  }
  const out = { ground: ground.join(""), feat: feat.join(""), soil: soil.join(""), ghost: "0".repeat(N * N), hx, hy, height: null, islets: [] };
  // the traits that reshape the land itself (a lagoon, a strait) come first
  const traits = (opts.traits || []).slice().sort((a, b) => (SHAPERS.includes(b) ? 1 : 0) - (SHAPERS.includes(a) ? 1 : 0));
  for (const t of traits) if (TRAIT_GEN[t]) TRAIT_GEN[t](out, rng((seed ^ TRAIT_SALT[t]) >>> 0));
  return out;
}

// island traits reshape a finished island, each with its own generator, so an
// island without traits comes out exactly as it always did
const TRAIT_SALT = { stony: 0x51a7e, marsh: 0x3a125, ruins: 0x7e1c5, highlands: 0x41915, tidal: 0x71da1, storm: 0x5703c, snow: 0x5a0b1,
  atoll: 0xa7011, twin: 0x7e1a2 };
const SHAPERS = ["atoll", "twin"];

// steps (4-connected, through tiles where `through` holds) from the nearest tile
// where `from` holds; Infinity where unreached
function stepsFrom(from, through) {
  const d = new Array(N * N).fill(Infinity), q = [];
  for (let i = 0; i < N * N; i++) if (from(i)) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, j = ny * N + nx;
      if (inMap(nx, ny) && d[j] === Infinity && through(j)) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
const TRAIT_GEN = {
  // boulder fields, scree slopes and heather
  stony(m, r) {
    const feat = m.feat.split(""), soil = m.soil.split(""), ns = noiseField(r, 3);
    const far = i => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy)) > 2;
    for (let i = 0; i < N * N; i++) {
      if (m.ground[i] !== "." || !far(i)) continue;
      if (ns(i % N, (i / N) | 0) > 0.56) { soil[i] = "s"; if (feat[i] !== "." && r() < 0.5) feat[i] = "."; if (feat[i] === "." && r() < 0.1) feat[i] = "h"; }
    }
    for (let k = 0; k < Math.round((N * N) / 60); k++) {
      const cx = Math.floor(r() * N), cy = Math.floor(r() * N);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const x = cx + i, y = cy + j, q = y * N + x;
        if (inMap(x, y) && m.ground[q] === "." && far(q) && r() < 0.6) feat[q] = r() < 0.3 ? "k" : "r";
      }
    }
    m.feat = feat.join(""); m.soil = soil.join("");
  },
  // wet marsh with reeds; willows on its edges
  marsh(m, r) {
    const feat = m.feat.split(""), soil = m.soil.split(""), nw = noiseField(r, 3.5);
    const far = i => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy)) > 2;
    for (let i = 0; i < N * N; i++) {
      if (m.ground[i] !== "." || !far(i) || nw(i % N, (i / N) | 0) <= 0.55) continue;
      soil[i] = "w";
      feat[i] = r() < 0.22 ? "e" : ".";
    }
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (m.ground[i] === "." && soil[i] !== "w" && far(i) && feat[i] === "." && DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && soil[(y + dy) * N + x + dx] === "w") && r() < 0.15) feat[i] = "l";
    }
    m.feat = feat.join(""); m.soil = soil.join("");
  },
  // ruins of an older village, joined by ghost paths
  ruins(m, r) {
    const feat = m.feat.split(""), ghost = m.ghost.split(""), sites = [];
    for (let tries = 0; tries < 200 && sites.length < 4; tries++) {
      const a = r() * Math.PI * 2, d = 5 + r() * 4, x = Math.round(m.hx + Math.cos(a) * d), y = Math.round(m.hy + Math.sin(a) * d);
      if (!inMap(x, y) || m.ground[y * N + x] !== "." || sites.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < 5)) continue;
      sites.push([x, y]);
    }
    // old roads: from one site to the next and back to near the hearth, in two straight legs
    const pts = [[m.hx + 2, m.hy + 2], ...sites];
    const mark = (x, y) => { const q = y * N + x; if (inMap(x, y) && m.ground[q] === ".") { ghost[q] = "1"; feat[q] = "."; } };
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) mark(x, ay);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) mark(bx, y);
    }
    for (const [x, y] of sites) {
      feat[y * N + x] = "u"; ghost[y * N + x] = "0";
      for (const [dx, dy] of RING) {
        const q = (y + dy) * N + x + dx;
        if (inMap(x + dx, y + dy) && m.ground[q] === "." && ghost[q] !== "1" && r() < 0.25) feat[q] = "q";
      }
    }
    m.feat = feat.join(""); m.ghost = ghost.join("");
  },
  // hills: a height map rising from the shore, terraces one level apart and here
  // and there a cliff (two levels).  Firs grow high up, alpine plants and scree on
  // the tops.  The hearth stands on flat ground, and every part stays reachable
  highlands(m, r) {
    const feat = m.feat.split(""), soil = m.soil.split(""), nh = noiseField(r, 4), nc = noiseField(r, 3);
    const land = i => m.ground[i] !== "~", H = new Array(N * N).fill(0);
    const sea = stepsFrom(i => !land(i), land);
    for (let i = 0; i < N * N; i++) if (land(i)) H[i] = Math.max(0, Math.min(7, Math.round(sea[i] * 0.6 + (nh(i % N, (i / N) | 0) - 0.35) * 5)));
    const flat = (i, d) => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy)) <= d;
    const hh = H[m.hy * N + m.hx];
    for (let i = 0; i < N * N; i++) if (flat(i, 2)) H[i] = hh;
    // slopes of one level at a time, except where the cliff noise says so (never by
    // the water or the hearth)
    const cliff = i => nc(i % N, (i / N) | 0) > 0.66 && m.ground[i] === "." && !flat(i, 3);
    for (let pass = 0; pass < 12; pass++) for (let i = 0; i < N * N; i++) {
      if (!land(i) || flat(i, 2)) continue;
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of DIRS) {
        const j = (y + dy) * N + x + dx;
        if (!inMap(x + dx, y + dy) || !land(j)) continue;
        const most = cliff(i) && cliff(j) ? 2 : 1;
        if (H[i] - H[j] > most) H[i] = H[j] + most;
        if (H[j] - H[i] > most && !flat(j, 2)) H[j] = H[i] + most;
      }
    }
    // every tile reachable from the hearth by steps of one level (rivers count as crossable)
    for (let tries = 0; tries < 60; tries++) {
      const seen = new Uint8Array(N * N), q = [m.hy * N + m.hx];
      seen[q[0]] = 1;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of DIRS) {
          const j = (y + dy) * N + x + dx;
          if (inMap(x + dx, y + dy) && !seen[j] && land(j) && Math.abs(H[i] - H[j]) <= 1) { seen[j] = 1; q.push(j); }
        }
      }
      let fixed = 0;
      for (let i = 0; i < N * N; i++) {
        if (!land(i) || seen[i]) continue;
        const x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of DIRS) {
          const j = (y + dy) * N + x + dx;
          if (inMap(x + dx, y + dy) && seen[j]) { H[i] = H[j] + Math.sign(H[i] - H[j]); fixed++; break; }
        }
      }
      if (!fixed) break;
    }
    const top = Math.max(...H);
    for (let i = 0; i < N * N; i++) {
      if (m.ground[i] !== "." || flat(i, 2)) continue;
      if ("opb".includes(feat[i]) && H[i] >= 3 && r() < 0.85) feat[i] = "j";
      if (H[i] >= top - 1 && H[i] >= 4) { soil[i] = "s"; if (feat[i] !== "." && r() < 0.6) feat[i] = "."; }
      if (feat[i] === "." && H[i] >= 3 && r() < 0.08) feat[i] = "a";
    }
    m.feat = feat.join(""); m.soil = soil.join(""); m.height = H.join("");
  },
  // spring tides: islets a few tiles out, sandbars out to them, sand along the
  // shore with dune grass and driftwood
  tidal(m, r) {
    const ground = m.ground.split(""), soil = m.soil.split(""), feat = m.feat.split("");
    const off = stepsFrom(i => ground[i] !== "~", i => ground[i] === "~");
    const islets = [];
    for (let tries = 0; tries < 400 && islets.length < 3; tries++) {
      const x = 2 + Math.floor(r() * (N - 4)), y = 2 + Math.floor(r() * (N - 4)), i = y * N + x;
      if (ground[i] !== "~" || off[i] < 3 || off[i] > 4 || islets.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) < 5)) continue;
      const blob = [i];
      for (const [dx, dy] of RING) {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && off[ny * N + nx] >= 2 && r() < 0.55) blob.push(ny * N + nx);
      }
      if (blob.length < 3) continue;
      for (const j of blob) { ground[j] = "."; soil[j] = "a"; feat[j] = r() < 0.3 ? "d" : "."; }
      islets.push([x, y]);
      // the sandbar: down the distance to the island, one tile at a time
      let k = i;
      for (let step = 0; step < 8 && off[k] > 1; step++) {
        const kx = k % N, ky = (k / N) | 0;
        let best = k;
        for (const [dx, dy] of DIRS) { const j = (ky + dy) * N + kx + dx; if (inMap(kx + dx, ky + dy) && off[j] < off[best]) best = j; }
        if (best === k) break;
        k = best;
        if (ground[k] === "~") ground[k] = "_";
      }
    }
    // more flats hug the coast
    const nf = noiseField(r, 2.5);
    for (let i = 0; i < N * N; i++) if (ground[i] === "~" && off[i] === 1 && nf(i % N, (i / N) | 0) > 0.62) ground[i] = "_";
    const far = i => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy)) > 2;
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (ground[i] !== "." || !far(i) || soil[i] === "a" || !DIRS.some(([dx, dy]) => !inMap(x + dx, y + dy) || "~_".includes(ground[(y + dy) * N + x + dx]))) continue;
      soil[i] = "a";
      if (feat[i] !== "." && r() < 0.7) feat[i] = ".";
      if (feat[i] === ".") feat[i] = r() < 0.16 ? "d" : r() < 0.05 ? "w" : ".";
    }
    m.ground = ground.join(""); m.soil = soil.join(""); m.feat = feat.join(""); m.islets = islets;
  },
  // wind-bent pines and gorse along the shore, sea stacks off it
  storm(m, r) {
    const feat = m.feat.split(""), land = i => m.ground[i] !== "~";
    const sea = stepsFrom(i => !land(i), land), shore = stepsFrom(land, i => !land(i));
    const far = i => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy)) > 2;
    let stacks = 0;
    for (let i = 0; i < N * N; i++) {
      if (m.ground[i] === "." && far(i) && sea[i] <= 3) {
        if ("opb".includes(feat[i]) && r() < 0.8) feat[i] = "x";
        else if (feat[i] === "." && r() < 0.07) feat[i] = "g";
      }
      if (!land(i) && shore[i] >= 1 && shore[i] <= 2 && stacks < 8 && r() < 0.05) { feat[i] = "y"; stacks++; }
    }
    m.feat = feat.join("");
  },
  // snowfields, snowy spruces and bare shrubs, and a pond or two that freeze in winter
  snow(m, r) {
    const ground = m.ground.split(""), feat = m.feat.split(""), soil = m.soil.split(""), ns = noiseField(r, 3);
    const far = (i, d) => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy)) > d;
    for (let i = 0; i < N * N; i++) {
      if (ground[i] !== "." || !far(i, 2)) continue;
      if (ns(i % N, (i / N) | 0) > 0.55) soil[i] = "i";
      if ("op".includes(feat[i]) && r() < 0.8) feat[i] = "n";
      else if (feat[i] === "." && r() < 0.05) feat[i] = "c";
    }
    for (let k = 0, tries = 0; k < 2 && tries < 200; tries++) {
      const x = 1 + Math.floor(r() * (N - 3)), y = 1 + Math.floor(r() * (N - 3));
      const q = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => (y + dy) * N + x + dx);
      if (!q.every(i => ground[i] === "." && far(i, 3) && feat[i] !== "u")) continue;
      for (const i of q) { ground[i] = "="; feat[i] = "."; soil[i] = "."; }
      k++;
    }
    m.ground = ground.join(""); m.feat = feat.join(""); m.soil = soil.join("");
  },
  // a ring of land round a lagoon, off to one side of the village: sand along every
  // shore, palms on the ring and mangroves standing in the lagoon's edge
  atoll(m, r) {
    const ground = m.ground.split(""), feat = m.feat.split(""), soil = m.soil.split("");
    const land = i => ground[i] !== "~", deep = stepsFrom(i => !land(i), land);
    const far = i => Math.max(Math.abs((i % N) - m.hx), Math.abs(((i / N) | 0) - m.hy));
    let best = -1, bd = -1;
    for (let k = 0; k < 16; k++) {
      const a = r() * Math.PI * 2, d = 5 + r() * 2.5, x = Math.round(m.hx + Math.cos(a) * d), y = Math.round(m.hy + Math.sin(a) * d);
      if (inMap(x, y) && land(y * N + x) && deep[y * N + x] > bd && deep[y * N + x] < Infinity) { bd = deep[y * N + x]; best = y * N + x; }
    }
    if (best < 0 || bd < 3) return; // too small an island for a lagoon
    const cx = best % N, cy = (best / N) | 0, rad = Math.max(3, N * 0.2), nl = noiseField(r, 3), wet = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (land(i) && deep[i] >= 3 && far(i) > 3 && Math.hypot(x - cx, y - cy) / rad + (nl(x, y) - 0.5) * 0.6 < 1) wet[i] = 1;
    }
    // one lagoon: the water joined to its middle
    const lagoon = new Uint8Array(N * N), q = [best];
    lagoon[best] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of DIRS) { const j = (y + dy) * N + x + dx; if (inMap(x + dx, y + dy) && wet[j] && !lagoon[j]) { lagoon[j] = 1; q.push(j); } }
    }
    for (let i = 0; i < N * N; i++) if (lagoon[i]) { ground[i] = "~"; feat[i] = "."; soil[i] = "."; }
    for (let i = 0; i < N * N; i++) {
      if (!land(i) || far(i) <= 2) continue;
      const x = i % N, y = (i / N) | 0, nb = DIRS.map(([dx, dy]) => (inMap(x + dx, y + dy) ? (y + dy) * N + x + dx : -1));
      const byLagoon = nb.some(j => j >= 0 && lagoon[j]), bySea = nb.some(j => j < 0 || (!land(j) && !lagoon[j]));
      if (ground[i] === "." && (byLagoon || bySea)) {
        soil[i] = "a";
        if (feat[i] !== "." && r() < 0.7) feat[i] = ".";
        // (sparse along the lagoon, so its shore can be reached and landed on)
        if (feat[i] === ".") feat[i] = byLagoon ? (r() < 0.12 ? "z" : ".") : r() < 0.14 ? "v" : ".";
      } else if ("opb".includes(feat[i]) && r() < 0.55) feat[i] = "v";
    }
    m.ground = ground.join(""); m.feat = feat.join(""); m.soil = soil.join("");
  },
  // a strait of sea 2 tiles wide, 5 to 8 off the village, splits the island in two;
  // a sandbar ford crosses it in the middle (dry at a spring tide).  Its water is soil "c"
  twin(m, r) {
    const orig = m.ground.split(""), land = orig.filter(g => g !== "~").length;
    let ground, soil, feat, cells;
    for (let attempt = 0; attempt < 8; attempt++) {
      ground = orig.slice(); soil = m.soil.split(""); feat = m.feat.split(""); cells = [];
      const axis = r() < 0.5 ? 0 : 1, side = r() < 0.5 ? -1 : 1, centre = axis ? m.hx : m.hy;
      let c = centre + side * (5 + Math.floor(r() * 2));
      for (let t = 0; t < N; t++) {
        const here = [];
        const mark = cc => { const x = axis ? cc : t, y = axis ? t : cc, q = y * N + x; if (!inMap(x, y)) return; here.push(q); if (ground[q] !== "~") { ground[q] = "~"; soil[q] = "c"; feat[q] = "."; } };
        mark(c); mark(c + side);
        if (r() < 0.3) {
          const nc = c + (r() < 0.5 ? -1 : 1);
          if (Math.abs(nc - centre) >= 4 && Math.abs(nc - centre) <= 8 && nc > 1 && nc < N - 3) { mark(nc); mark(nc + side); c = nc; }
        }
        cells.push(here);
      }
      // the far isle must be worth the crossing
      const seen = new Uint8Array(N * N), q = [m.hy * N + m.hx];
      seen[q[0]] = 1;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of DIRS) { const j = (y + dy) * N + x + dx; if (inMap(x + dx, y + dy) && !seen[j] && ground[j] !== "~") { seen[j] = 1; q.push(j); } }
      }
      const farLand = ground.filter((g, i) => g !== "~" && !seen[i]).length;
      if (farLand >= land * 0.2) break;
    }
    // the ford: across the strait where the village looks over it
    const mid = Math.round((m.hx + m.hy) / 2), ford = [0, 1, -1, 2, -2, 3, -3].map(k => cells[mid + k]).find(h => h && h.length && h.every(q => orig[q] !== "~"));
    if (ford) for (const q of ford) ground[q] = "_";
    m.ground = ground.join(""); m.soil = soil.join(""); m.feat = feat.join("");
  },
};

const newSeed = () => (Math.random() * 1e9) | 0;

// a new island and its first two villagers; opts as for genIsland (and chapter),
// stock from R.start.  Later chapters land a crew instead (voyage.js)
function freshState(seed = newSeed(), n = ISLAND_N, opts = {}) {
  N = n;
  const m = genIsland(seed, opts), chapter = opts.chapter || 1;
  const S = {
    v: 1, n: N, seed, day: 1, ...R.start, chapter, traits: opts.traits || ["meadow"], goal: chapterGoal(chapter), goalMet: false,
    ground: m.ground, feat: m.feat, soil: m.soil, cob: "0".repeat(N * N), deco: ".".repeat(N * N), ghost: m.ghost,
    ...(m.height ? { height: m.height } : {}), ...(m.islets.length ? { islets: m.islets } : {}), late: [],
    wear: new Array(N * N).fill(0), foot: new Array(N * N).fill(0),
    b: [], nextId: 1, vil: [], nextV: 1, ms: 0,
    seen: false, cam: null, t: Date.now(),
    stats: { arrived: 0, built: 0, coins: 0 },
    // moments (events.js, shapes.js): the event deck, the festival's flagstone scar, the
    // secret shapes found here, the cobble pattern, the merchant's stall while it is open
    ev: { next: 0, cur: null, log: [] }, scar: [], secrets: [], pattern: "cobble", shop: null, feast: 0,
  };
  for (const r of RES) if (typeof S[r] !== "number") S[r] = 0;
  addBuilding(S, "hearth", m.hx, m.hy);
  const home = addBuilding(S, "cottage", m.hx - 2, m.hy + 1); // just off the hearth square
  for (let i = 0; i < 2; i++) addVillager(S, home.id);
  return S;
}

function addBuilding(S, t, x, y) {
  const b = { id: S.nextId++, t, x, y, age: 0, look: (x * 7 + y * 13) % 5 };
  S.b.push(b);
  return b;
}
function addVillager(S, home) {
  const v = { id: S.nextV++, home, look: (S.nextV * 37 + S.seed) % 97 };
  v.name = villagerName(S.seed, v.id);
  S.vil.push(v);
  return v;
}

// the island being played; save.js loads it at boot, the tools make one with freshState
let S = null;

// ------------------------------------------------------------------- names

// hashed from the seed, never drawn from the island's generator, so names
// change nothing else
function hashInt(...k) {
  let h = 0x2545f491;
  for (const v of k) { h = Math.imul(h ^ (v >>> 0), 0x9e3779b1); h ^= h >>> 16; }
  h = Math.imul(h, 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
const NAMES = ("Ada Alba Arlo Bea Bram Briar Cora Cal Dell Dora Edda Elm Esme Fern Finn Flora Gil Greta Hal Hazel Hob Ida " +
  "Ines Ivo Jory June Kit Kestrel Lark Linn Lotte Mabel Milo Moss Ned Nell Nia Oak Olwen Otto Pip Poppy Quill Rhea Rook " +
  "Rosa Rue Sage Sol Suki Tam Tamsin Teo Tilda Ula Una Vesper Vida Wren Wyn Yara Yves Zeb Zinnia Abe Bo Clem Dot Effie " +
  "Fitz Gus Hattie Ike Jem Juno Lou Mo Nico Ossie Pim Roo Sid Tess Toby Vi Wally Willa").split(" ");
const villagerName = (seed, id) => NAMES[hashInt(seed, id, 7) % NAMES.length];

const ISLE_A = ["Kittle", "Brindle", "Saltmere", "Hollow", "Gannet", "Wicken", "Merrow", "Tansy", "Fallow", "Puffin",
  "Clover", "Ember", "Heather", "Lantern", "Marram", "Oyster", "Pebble", "Rushy", "Samphire", "Thistle", "Wren", "Amber"];
const ISLE_B = ["Isles", "Reach", "Holms", "Skerries", "Archipelago", "Shoals", "Sounds", "Keys"];
const worldName = k => `The ${ISLE_A[hashInt(k, 1) % ISLE_A.length]} ${ISLE_B[hashInt(k, 2) % ISLE_B.length]}`;

// one character per tile for thumbnails (slots, the setup preview, the chart):
// ~ sea, . grass, m meadow, = river, # bridge, t tree, r rock, w worn path, c cobbles,
// f field, b building, h hearth; trait ground: x marsh, z scree, e reeds or heather, u ruin
// and for the new traits: _ sandbar, a sand, i snowfield, ^ high ground
function thumbCodes(isl) {
  const n = isl.n, out = new Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const g = isl.ground[i], f = isl.feat[i];
    const s = isl.soil[i];
    out[i] = g !== "." ? g : "rk".includes(f) ? "r" : "hegadcw".includes(f) ? "e" : "uUq".includes(f) ? "u" : f !== "." ? "t"
      : (isl.cob && isl.cob[i] === "1") || s === "L" ? "c" : isl.wear && isl.wear[i] >= WEAR.path ? "w"
      : s === "m" ? "m" : s === "w" || s === "W" ? "x" : s === "s" ? "z" : s === "a" ? "a" : s === "i" ? "i"
      : isl.height && +isl.height[i] >= 4 ? "^" : ".";
  }
  for (const b of isl.b || []) out[b.y * n + b.x] = b.t === "hearth" ? "h" : b.t === "field" && !b.site ? "f" : "b";
  return out.join("");
}

// ------------------------------------------------------------------ queries

const ground = (x, y) => (inMap(x, y) ? S.ground[idx(x, y)] : "~");
const feat = (x, y) => (inMap(x, y) ? S.feat[idx(x, y)] : ".");
const isTree = (x, y) => "opbljnxvz".includes(feat(x, y));  // oak, pine, birch, willow, fir, spruce, wind pine, palm, mangrove: woodcutters use them
const isRock = (x, y) => "rk".includes(feat(x, y));          // rocks and boulders: quarries cut them
const isBrush = (x, y) => "hegadcw".includes(feat(x, y));    // heather, reeds, gorse, alpine, dune grass, shrubs, driftwood
const isProp = (x, y) => !!PROPS[feat(x, y)];                 // left by the event deck (events.js)
const marsh = (x, y) => inMap(x, y) && S.soil[idx(x, y)] === "w";
const meadow = (x, y) => inMap(x, y) && S.soil[idx(x, y)] === "m";
function setChar(key, x, y, ch) { const i = idx(x, y); S[key] = S[key].slice(0, i) + ch + S[key].slice(i + 1); }

// buildings by tile, rebuilt on change
let byTile = new Map(), hearthB = null;
function reindex() { byTile = new Map(S.b.map(b => [idx(b.x, b.y), b])); hearthB = S.b.find(b => b.t === "hearth"); }
// the square round the hearth (its 8 neighbours) stays open: nothing is built there,
// so the gathering on the benches can always be seen
const onSquare = (x, y) => !!hearthB && (x !== hearthB.x || y !== hearthB.y) &&
  Math.abs(x - hearthB.x) <= 1 && Math.abs(y - hearthB.y) <= 1;
const bAt = (x, y) => byTile.get(idx(x, y));
const bById = id => S.b.find(b => b.id === id);
const count = t => S.b.filter(b => b.t === t).length;
const deco = (x, y) => (inMap(x, y) ? DECO[S.deco[idx(x, y)]] || null : null);
const decoCount = ch => S.deco.split(ch).length - 1;

// trails form at trailAt(): less wear in spring (weather.js)
function level(i) {
  if (S.cob[i] === "1") return 3;
  const w = S.wear[i];
  return w >= R.wear.path ? 2 : w >= trailAt() ? 1 : 0;
}

const isLand = (x, y) => ground(x, y) === "." || ground(x, y) === "#";
const seaAt = (x, y) => ground(x, y) === "~" || ground(x, y) === "_"; // a sandbar is sea, for the shore
const coastal = (x, y) => DIRS.some(([dx, dy]) => seaAt(x + dx, y + dy));

// can a villager walk over this tile?  Worked out for the whole map at once and
// kept while the ground, the features, the soil, the buildings and the weather stay
// the same: a sandbar can be walked at a spring tide (or over a causeway), a river
// once it freezes (the Snow north's winter)
let walkGrid = null, walkKey = [null, null, null, -1, null, -1];
function walkable(x, y) {
  if (!inMap(x, y)) return false;
  const X = wx(), wk = (X.tide ? 1 : 0) | (X.frozen ? 2 : 0);
  if (walkKey[0] !== S.ground || walkKey[1] !== S.feat || walkKey[2] !== byTile || walkKey[3] !== N || walkKey[4] !== S.soil || walkKey[5] !== wk) {
    walkGrid = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const g = S.ground[i];
      // (a ferry pier is a jetty: walked along, and the ferry's lane goes on over the water)
      walkGrid[i] = g === "#" || (g === "." && S.feat[i] === "." && (!byTile.has(i) || byTile.get(i).t === "ferry")) || (g === "_" && (X.tide || S.soil[i] === "W"))
        || (g === "=" && X.frozen) || (g === "~" && S.soil[i] === "f") ? 1 : 0;
    }
    walkKey = [S.ground, S.feat, byTile, N, S.soil, wk];
  }
  return walkGrid[y * N + x] === 1;
}

// the sides a building is entered from, as bits in DIRS order (+x, +y, -x, -y).
// A building with a door is entered from the front (+x or +y: the sides facing the
// viewer), so paths lead up to the door; if both are blocked, from any side
function doorMask(b) {
  if (!BD[b.t].door || b.site) return 15;
  const m = (walkable(b.x + 1, b.y) ? 1 : 0) | (walkable(b.x, b.y + 1) ? 2 : 0);
  return m || 15;
}

// a home's beds.  A house's extra beds are only open while its needs are met:
// `needs` is a plan's (sim.js); without one, the forecast's, else last night's
const isHome = b => b.t === "cottage" || b.t === "house";
function bedsOf(b, needs = typeof forecast !== "undefined" && forecast ? forecast.needs : null) {
  if (!isHome(b)) return 0;
  let n = BD[b.t].beds + (nearWell(b.x, b.y) ? 1 : 0) + (streetFront(b.x, b.y) ? 1 : 0) + (nearLodge(b.x, b.y) ? 1 : 0) + (b.t === "house" ? R.houseBonus : 0);
  if (b.t === "house" && !(needs ? needs[b.id] && needs[b.id].met : b.met)) n -= R.houseExtra;
  return n;
}
const nearWell = (x, y) => S.b.some(w => w.t === "well" && Math.max(Math.abs(w.x - x), Math.abs(w.y - y)) <= R.wellRadius);
// the Snow north: homes by a lodge are warm, one more bed
const nearLodge = (x, y) => S.b.some(w => w.t === "lodge" && !w.site && Math.max(Math.abs(w.x - x), Math.abs(w.y - y)) <= 2);
const streetFront = (x, y) => DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && S.cob[idx(x + dx, y + dy)] === "1");
// every open bed, and the beds still taken where a house's needs lapsed (nobody is evicted)
const totalBeds = needs => S.b.reduce((a, b) => a + (isHome(b) ? Math.max(bedsOf(b, needs), residents(b.id)) : 0), 0);
const residents = id => S.vil.filter(v => v.home === id).length;
const pop = () => S.vil.length;

// what can be built: the milestones' tiers (all known from chapter 2 on), a trait's
// buildings on its islands, the ship once the island's goal is met (and the voyage
// goes on), the harbour once an island has been settled
function unlocked(def) {
  if (def.id === "ship") return !!S.goalMet && !lastChapter();
  if (def.id === "harbour") return S.chapter > 1;
  // the town hall after the first island's goal (known from then on); what it brings once it stands
  if (def.id === "townhall") return !!S.goalMet || S.chapter > 1;
  if (def.id === "grandmarket" || def.id === "reclaim") return hallStands();
  if (def.trait) return S.traits.includes(def.trait) || (def.id === "pave" && S.stone > 0);
  return def.tier <= S.ms;
}
// the next goal: chapter 1's milestones, then each chapter's goal (its reward: the ship)
const nextMilestone = () => (S.chapter > 1 ? (S.goalMet ? null : { pop: S.goal, unlock: lastChapter() ? [] : ["ship"], goal: true, festival: lastChapter() })
  : MILESTONES[S.ms] || null);
// the voyage's last island: its goal ends the voyage, and no ship is built there (unless
// the voyage sails on, endless, after its Grand Festival)
const lastChapter = () => !!W && W.settings.length > 0 && !W.voyage.endless && S.chapter >= W.settings.length;
const hallStands = () => S.b.some(b => b.t === "townhall" && !b.site);

// the chronicle (stats.js): what happened, a line a time
function chron(kind, str) {
  if (!S.log) S.log = [];
  S.log.push([S.day, kind, str]);
  if (S.log.length > LOG_MAX) S.log.shift();
}

// the world being played (save.js), with its chart, voyage and settled islands
let W = null;
