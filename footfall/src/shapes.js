/* Secret shapes (the plan's §9), looked for each night on the grid of path-or-better
 * tiles (a path, or cobbles).  Found for the first time anywhere, a shape opens its
 * page in the codex's SECRETS tab and gives a cosmetic (PROFILE.secrets,
 * PROFILE.cosmetics): sidegrades that carry across worlds, never power.  Each island
 * keeps the shapes found on it (S.secrets) for its card on the chart.
 *
 * Every test returns the tiles that make the shape (for the moment it is found, and
 * SHOW ME), or null.
 */
"use strict";

// the grid the shapes are made of: path or cobbles, not under a building
function pathGrid() {
  const g = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (!byTile.has(i) && S.ground[i] !== "~" && S.ground[i] !== "=" && level(i) >= 2) g[i] = 1;
  return g;
}

// the regions of open ground between the paths (4-connected): lab[i] its region, and
// whether each touches the edge of the map (else it is a hole, closed in by paths)
function regions(g) {
  const lab = new Int32Array(N * N).fill(-1), open = [];
  let n = 0;
  for (let s = 0; s < N * N; s++) {
    if (g[s] || lab[s] >= 0) continue;
    let edge = false;
    const q = [s];
    lab[s] = n;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % N, y = (i / N) | 0;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) edge = true;
      for (const [dx, dy] of DIRS) {
        const j = idx(x + dx, y + dy);
        if (inMap(x + dx, y + dy) && !g[j] && lab[j] < 0) { lab[j] = n; q.push(j); }
      }
    }
    open.push(edge);
    n++;
  }
  return { lab, open, n };
}
// the path tiles round a region (8-adjacent to it)
function rim(g, lab, id) {
  const out = new Set();
  for (let i = 0; i < N * N; i++) {
    if (lab[i] !== id) continue;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of RING) { const j = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && g[j]) out.add(j); }
  }
  return out;
}
// connected groups of tiles where `on` holds (4-connected), each a list
function groups(on) {
  const seen = new Uint8Array(N * N), out = [];
  for (let s = 0; s < N * N; s++) {
    if (!on(s) || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of DIRS) { const j = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && !seen[j] && on(j)) { seen[j] = 1; q.push(j); } }
    }
    out.push(q);
  }
  return out;
}

const SHAPES = {
  // a closed loop whose inside holds the hearth and its square (so the square itself,
  // which everyone crosses, doesn't count)
  ring(g) {
    if (!hearthB) return null;
    const h = g.slice();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inMap(hearthB.x + i, hearthB.y + j)) h[idx(hearthB.x + i, hearthB.y + j)] = 0;
    const { lab, open } = regions(h), id = lab[idx(hearthB.x, hearthB.y)];
    return open[id] ? null : [...rim(h, lab, id)];
  },
  // two loops that touch at one tile: two holes on opposite corners of it, sharing no
  // other rim tile, with the same open ground on its other two corners
  eight(g) {
    const { lab, open } = regions(g), rims = new Map();
    const rimOf = id => { if (!rims.has(id)) rims.set(id, rim(g, lab, id)); return rims.get(id); };
    const at = (x, y) => (inMap(x, y) && !g[idx(x, y)] ? lab[idx(x, y)] : -1);
    for (let c = 0; c < N * N; c++) {
      if (!g[c]) continue;
      const x = c % N, y = (c / N) | 0;
      for (const [[ax, ay], [bx, by], [ox, oy], [px, py]] of [[[-1, -1], [1, 1], [1, -1], [-1, 1]], [[1, -1], [-1, 1], [-1, -1], [1, 1]]]) {
        const a = at(x + ax, y + ay), b = at(x + bx, y + by), o = at(x + ox, y + oy), p = at(x + px, y + py);
        if (a < 0 || b < 0 || a === b || open[a] || open[b] || o < 0 || o !== p || o === a || o === b) continue;
        const A = rimOf(a), B = rimOf(b);
        let shared = 0;
        for (const t of A) if (B.has(t)) shared++;
        if (shared === 1) return [...A, ...B];
      }
    }
    return null;
  },
  // one unbranched path (no junctions) winding 1.5 turns round a point: its end, or
  // its middle
  spiral(g) {
    const deg = i => { const x = i % N, y = (i / N) | 0; let n = 0; for (const [dx, dy] of DIRS) if (inMap(x + dx, y + dy) && g[idx(x + dx, y + dy)]) n++; return n; };
    const two = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) if (g[i] && deg(i) <= 2) two[i] = 1;
    for (const part of groups(i => two[i] === 1)) {
      if (part.length < 12) continue;
      const inPart = new Set(part), next = i => DIRS.map(([dx, dy]) => [(i % N) + dx, ((i / N) | 0) + dy]).filter(([x, y]) => inMap(x, y) && inPart.has(idx(x, y))).map(([x, y]) => idx(x, y));
      const end = part.find(i => next(i).length <= 1);
      if (end === undefined) continue; // a closed loop
      const line = [end];
      for (let prev = -1, cur = end; ;) { const n = next(cur).find(j => j !== prev); if (n === undefined) break; line.push(n); prev = cur; cur = n; }
      const ends = [line[0], line[line.length - 1]], cands = [];
      for (const e of ends) for (const [dx, dy] of RING) { const x = (e % N) + dx, y = ((e / N) | 0) + dy; if (inMap(x, y) && !inPart.has(idx(x, y))) cands.push([x, y]); }
      const cx = line.reduce((a, i) => a + (i % N), 0) / line.length, cy = line.reduce((a, i) => a + ((i / N) | 0), 0) / line.length;
      cands.push([cx, cy]);
      for (const [px, py] of cands) {
        let turn = 0, ok = true;
        for (let k = 1; k < line.length; k++) {
          const ax = (line[k - 1] % N) - px, ay = ((line[k - 1] / N) | 0) - py, bx = (line[k] % N) - px, by = ((line[k] / N) | 0) - py;
          if ((!ax && !ay) || (!bx && !by)) { ok = false; break; }
          turn += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
        }
        if (ok && Math.abs(turn) >= 3 * Math.PI) return line;
      }
    }
    return null;
  },
  // one cobbled network touching every building on the island but the fields (20 at
  // least): a whole village on its streets
  tour() {
    const all = S.b.filter(b => b.t !== "field");
    if (all.length < 20) return null;
    for (const part of groups(i => S.cob[i] === "1" && !byTile.has(i))) {
      const got = new Set();
      for (const i of part) {
        const x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of DIRS) { const b = bAt(x + dx, y + dy); if (b) got.add(b.id); }
      }
      if (all.every(b => got.has(b.id))) return part;
    }
    return null;
  },
  // 12 cobbles in a straight row
  mile() {
    for (const [dx, dy] of [[1, 0], [0, 1]]) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const run = [];
      for (let k = 0; inMap(x + dx * k, y + dy * k) && S.cob[idx(x + dx * k, y + dy * k)] === "1"; k++) run.push(idx(x + dx * k, y + dy * k));
      if (run.length >= 12) return run;
      if (run.length) { if (dx) x += run.length - 1; }
    }
    return null;
  },
  // cobbles joining two shores on opposite sides of the island, across its middle
  coast() {
    let sx = 0, sy = 0, n = 0, x0 = N, x1 = 0, y0 = N, y1 = 0;
    for (let i = 0; i < N * N; i++) if (S.ground[i] === "." || S.ground[i] === "#") {
      const x = i % N, y = (i / N) | 0; sx += x; sy += y; n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const cx = sx / n, cy = sy / n, span = Math.max(x1 - x0, y1 - y0) + 1;
    for (const part of groups(i => S.cob[i] === "1")) {
      const shore = part.filter(i => coastal(i % N, (i / N) | 0));
      for (const a of shore) for (const b of shore) {
        const ax = (a % N) - cx, ay = ((a / N) | 0) - cy, bx = (b % N) - cx, by = ((b / N) | 0) - cy;
        const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
        if (cos <= -0.8 && Math.hypot(ax, ay) >= span * 0.3 && Math.hypot(bx, by) >= span * 0.3) return part;
      }
    }
    return null;
  },
  // 8 lamps along one cobbled path: between the two lamps farthest apart on it
  lantern() {
    for (const part of groups(i => S.cob[i] === "1")) {
      const lamps = part.filter(i => S.deco[i] === "l");
      if (lamps.length < 8) continue;
      const inPart = new Set(part);
      const bfs = s => {
        const from = new Map([[s, -1]]), q = [s];
        for (let k = 0; k < q.length; k++) {
          const i = q[k], x = i % N, y = (i / N) | 0;
          for (const [dx, dy] of DIRS) { const j = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && inPart.has(j) && !from.has(j)) { from.set(j, i); q.push(j); } }
        }
        return { from, far: q.filter(i => S.deco[i] === "l").pop() };
      };
      const a = bfs(lamps[0]).far, { from, far: b } = bfs(a), line = [];
      for (let i = b; i !== -1; i = from.get(i)) line.push(i);
      if (line.filter(i => S.deco[i] === "l").length >= 8) return line;
    }
    return null;
  },
};

// each night (applyNight): the shapes not found on this island yet
function checkShapes() {
  if (!S.secrets) return;
  const todo = SECRETS.filter(s => !s.event && !S.secrets.includes(s.id));
  if (!todo.length) return;
  const g = pathGrid();
  for (const s of todo) { const tiles = SHAPES[s.id](g); if (tiles) foundSecret(s.id, tiles); }
}

// a secret found on this island; the first time anywhere, its page and its gift
function foundSecret(id, tiles) {
  if (!S.secrets.includes(id)) S.secrets.push(id);
  const first = typeof PROFILE !== "undefined" && !PROFILE.secrets.includes(id);
  if (first) { PROFILE.secrets.push(id); gainCosmetic(SECRETS.find(s => s.id === id).gift); saveProfile(); }
  moments.found.push({ id, tiles, first });
  chron("secret", `A secret shape: *${SECRETS.find(s => s.id === id).name}*.`);
}
// where a shape is on the island right now (SHOW ME), or null
const shapeTiles = id => (SHAPES[id] ? SHAPES[id](pathGrid()) : null);
