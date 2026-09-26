/* The island on screen: terrain, sea, objects, walkers and particles.
 *
 * The ground (grass, paths, fields, river, cliffs, shallows) is painted pixel by
 * pixel into an offscreen canvas whenever the map changes, so a frame only blits
 * it.  Paths are autotiled: a worn tile draws a band from its centre towards
 * every worn neighbour and every door, so trails join up into networks.
 * Things that stand up (trees, buildings, walkers) are sorted by depth (x + y)
 * and drawn each frame.
 */
"use strict";

const cam = { x: 0, y: 0 };            // screen position of tile (0,0)'s top vertex
// the Highlands: each height level lifts a tile LIFT pixels
const LIFT = 3;
const liftAt = (x, y) => {
  if (!S.height) return 0;
  x = Math.round(x); y = Math.round(y);
  return inMap(x, y) && S.ground[y * N + x] !== "~" ? +S.height[y * N + x] * LIFT : 0;
};
const tileTop = (x, y) => [cam.x + (x - y) * 16, cam.y + (x + y) * 8 - liftAt(x, y)];
const tileMid = (x, y) => [cam.x + (x - y) * 16, cam.y + (x + y) * 8 + 8 - liftAt(x, y)];

function screenToTile(mx, my) {
  const dx = mx + 0.5 - cam.x, dy = my + 0.5 - cam.y;
  const u = dy / 8 + dx / 16, v = dy / 8 - dx / 16, base = [Math.floor(u / 2), Math.floor(v / 2)];
  if (!S.height) return base;
  // a lifted tile shows higher up the screen: of the tiles in front whose raised
  // diamond holds the point, the front-most
  let best = null;
  for (let k = 0; k <= 3; k++) for (const [ax, ay] of [[k, k], [k + 1, k], [k, k + 1]]) {
    const x = base[0] + ax, y = base[1] + ay;
    if (!inMap(x, y)) continue;
    const [tx, ty] = tileTop(x, y), ex = Math.abs(mx + 0.5 - tx) / 16, ey = Math.abs(my + 0.5 - ty - 8) / 8;
    if (ex + ey <= 1 && (!best || x + y > best[0] + best[1])) best = [x, y];
  }
  return best || base;
}

function centreCamera() {
  const h = S.b.find(b => b.t === "hearth"), V = VIEW.world;
  const [sx, sy] = [(h.x - h.y) * 16, (h.x + h.y) * 8 + 8];
  cam.x = Math.round(V.w / 2 - sx);
  cam.y = Math.round((V.h - 40 * VIEW.ui.px / V.px) / 2 - sy + 6);
  clampCamera();
}
function clampCamera() {
  // keep some of the island on screen whatever the pan (in the island's view)
  const V = VIEW.world, minX = V.w / 2 - N * 16 - 40, maxX = V.w / 2 + N * 16 + 40;
  cam.x = Math.round(Math.max(minX, Math.min(maxX, cam.x)));
  cam.y = Math.round(Math.max(V.h / 2 - N * 16 - 20, Math.min(V.h / 2 + 20, cam.y)));
}

// the settled islands on the horizon, each in its own direction: dark silhouettes
// of their real shape, a light where a lighthouse stands
const horizonCache = new Map();
function drawHorizon() {
  if (!W || visiting || !W.islands.length) return;
  W.islands.forEach((isl, k) => {
    if (!horizonCache.has(isl.node)) {
      const c = thumbCanvas(frozenCodes(isl), isl.n, 1.4), t = document.createElement("canvas");
      t.width = c.width; t.height = c.height;
      const g = t.getContext("2d");
      g.drawImage(c, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#3a7898"; g.fillRect(0, 0, t.width, t.height);
      horizonCache.set(isl.node, t);
    }
    const t = horizonCache.get(isl.node), a = -2.4 + k * 0.9, r = N * 20 + 70;
    const [mx, my] = tileMid(N / 2, N / 2), x = Math.round(mx + Math.cos(a) * r - t.width / 2), y = Math.round(my + Math.sin(a) * r * 0.5 - t.height / 2);
    ctx.drawImage(t, x, y);
    if (night.k > 0.3 && isl.frozen.b.some(b => b[1] === "lighthouse") && Math.floor(now * 1.3 + k) % 3) rect(x + t.width / 2, y + t.height / 3, 2, 2, "#fff0b0");
  });
}

// deterministic per-pixel noise
const hash = (x, y, s = 0) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const T = {
  grass: hex("#8cc063"), grass2: hex("#86ba5d"), grassLt: hex("#a4d474"), grassDk: hex("#74a64f"), shade: hex("#6b9a4a"),
  flower: [hex("#f4e27a"), hex("#f7b0c0"), hex("#ffffff")],
  dirt: hex("#cfa66a"), dirtDk: hex("#b08553"), dirtLt: hex("#dcb97e"),
  stone: hex("#bdb5a6"), stone2: hex("#a59d90"), grout: hex("#857d72"),
  cliffLip: hex("#6a9a48"), cliff: hex("#a4744a"), cliff2: hex("#8c6040"), cliffDk: hex("#6e4a32"),
  river: hex("#5ab0cf"), riverLt: hex("#86d0e0"), riverDk: hex("#3f8fb4"), bank: hex("#b08553"),
  plank: hex("#c49460"), plankDk: hex("#8e6238"), plankLt: hex("#dcae78"),
  soil: hex("#9a6a3c"), soilDk: hex("#7c5230"), crop: [hex("#9ad462"), hex("#b3d24c"), hex("#e8c24e")], cropLt: hex("#f6de84"),
  shallow: hex("#78c7cf"), shallow2: hex("#66b4c8"),
  meadow: hex("#a8c864"), meadow2: hex("#a2c25e"), meadowLt: hex("#c4dc7c"),
  // island traits: scree, marsh and its pools, old flagstones under ghost paths
  scree: hex("#a8a48c"), scree2: hex("#9c9880"), pebble: hex("#c8c4b0"), pebbleDk: hex("#7e7a68"),
  marsh: hex("#6f8a4a"), marsh2: hex("#67824a"), pool: hex("#5f8f98"), poolLt: hex("#8fb8bc"),
  flag: hex("#b8b2a2"), flagDk: hex("#8e887a"),
  // weather and the new traits: snow and the prints in it, ice, sand, flood water,
  // the sea wall's stones, autumn grass and the alpine turf of the Highlands
  snow: hex("#eef3f7"), snow2: hex("#e4ebf2"), snowDk: hex("#c8d4e0"), snowPrint: hex("#a9b8c8"), slush: hex("#bdb6aa"),
  ice: hex("#bfe0ec"), iceLt: hex("#e6f6fb"), iceDk: hex("#8fc0d6"),
  sand: hex("#e6d49a"), sand2: hex("#ddca8e"), sandDk: hex("#c6ae74"), shell: hex("#fbf4e4"), wetSand: hex("#b9b48e"),
  flood: hex("#6fb8cf"), floodLt: hex("#a6dbe6"),
  wall: hex("#9a948a"), wallLt: hex("#bcb6aa"), wallDk: hex("#5f5a53"),
  autumn: hex("#b0b45c"), autumn2: hex("#a8ac56"), autumnLt: hex("#d4c070"), leaf: [hex("#e0903a"), hex("#c8602e"), hex("#e8c050")],
  alpine: hex("#a2bc72"), alpine2: hex("#9ab46c"),
  // the Atoll's lagoon and its ferry lanes
  lagoon: hex("#6cc8c8"), lagoon2: hex("#62bcc4"), lagoonLt: hex("#a4e4dc"), lane: hex("#dff6f0"), buoy: hex("#e8604a"),
};
// the season's look for the terrain being painted (buildTerrain sets it from wx())
const look = { snow: false, autumn: false, spring: false, frozen: false, tide: false, pattern: "cobble" };
const SEA = "#4a9fc0", SEA_DK = "#3f8fb4", GLINT = "#bdeff0", FOAM = "#effcff";

const terrain = { cvs: document.createElement("canvas"), foam: [document.createElement("canvas"), document.createElement("canvas")], ox: 0, oy: 2 };

// the open sea: water joined to the map's edge (a lagoon isn't), kept per ground string
let seaCache = { ground: null, open: null };
function openSea() {
  if (seaCache.ground === S.ground && seaCache.open && seaCache.open.length === N * N) return seaCache.open;
  const open = new Uint8Array(N * N), q = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if ((x === 0 || y === 0 || x === N - 1 || y === N - 1) && "~_".includes(S.ground[i])) { open[i] = 1; q.push(i); }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) { const j = (y + dy) * N + x + dx; if (inMap(x + dx, y + dy) && !open[j] && "~_".includes(S.ground[j])) { open[j] = 1; q.push(j); } }
  }
  seaCache = { ground: S.ground, open };
  return open;
}

function buildTerrain() {
  const top = S.height ? Math.max(...[...S.height].map(Number)) * LIFT : 0;
  const W = N * 32 + 2, H = N * 16 + 16 + top, X0 = wx();
  terrain.oy = 2 + top; // room above for the lifted hills
  Object.assign(look, { snow: X0.snow, autumn: X0.season === 2, spring: X0.season === 0, frozen: X0.frozen, tide: X0.tide, pattern: S.pattern || "cobble" });
  // the festival's flagstone scar (events.js)
  const scar = new Uint8Array(N * N);
  for (const i of S.scar || []) scar[i] = 1;
  // a storm on the day ahead: its flood shows on the map before it comes
  const flood = X0.storm ? floodTiles() : null;
  terrain.ox = N * 16 + 1; // islands differ in size
  for (const c of [terrain.cvs, ...terrain.foam]) { c.width = W; c.height = H; }
  const g = terrain.cvs.getContext("2d");
  const img = g.createImageData(W, H), d = img.data;
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = (y * W + x) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = a;
  };
  const foam = [[], []];

  const sea = openSea();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gr = ground(x, y), tx = terrain.ox + (x - y) * 16 - 16, ty = terrain.oy + (x + y) * 8 - liftAt(x, y);
    if (gr === "~") { if (!sea[idx(x, y)]) lagoonTile(x, y, tx, ty, put); else shallows(x, y, tx, ty, put); if (S.soil[idx(x, y)] === "f") laneTile(x, y, tx, ty, put); continue; }
    const i = idx(x, y), lv = level(i), b = bAt(x, y);
    if (gr === "_") { sandbar(x, y, tx, ty, put, lv); continue; }
    // which sides a path on this tile continues through: +x, +y, -x, -y.  Into a
    // building only through its door (doorMask)
    const conn = DIRS.map(([dx, dy], k) => {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) return false;
      const nb = bAt(nx, ny);
      if (nb && nb.t !== "field") return !!((doorMask(nb) >> ((k + 2) & 3)) & 1);
      if (ground(nx, ny) === "#") return true;
      return walkable(nx, ny) && level(idx(nx, ny)) > 0;
    });
    const mask = b ? doorMask(b) : 15;
    const band = [0, 0.15, 0.19, 0.23][lv];
    for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
      if (!inDiamond(px, py)) continue;
      const u = ((py + 0.5) / 8 + (px + 0.5 - 16) / 16) / 2, v = ((py + 0.5) / 8 - (px + 0.5 - 16) / 16) / 2;
      const X = tx + px, Y = ty + py;
      let c;
      if (gr === "=" || gr === "#") c = riverPixel(x, y, u, v, X, Y, gr === "#");
      else if (b && b.t === "field") c = fieldPixel(b, u, v, X, Y);
      else {
        c = grassPixel(x, y, X, Y);
        // boardwalk planks across the marsh; the sea wall's stones
        if (S.soil[i] === "W") c = Math.floor((u + v) * 7) % 2 ? T.plank : Math.abs(u - v) < 0.06 ? T.plankDk : T.plankLt;
        if (S.soil[i] === "L") c = wallPixel(X, Y);
        // a soft dithered shadow under trees and buildings
        if ((b || STANDING.includes(feat(x, y))) && Math.hypot(u - 0.56, v - 0.44) < 0.36 && bayer(X, Y) < 10) c = look.snow ? T.snowDk : T.shade;
        // the hearth square: a round patch of packed earth, kept open (onSquare)
        const sq = hearthB && Math.hypot(x + u - hearthB.x - 0.5, y + v - hearthB.y - 0.5);
        if (sq < 1.5) c = squarePixel(sq, X, Y);
        else if (scar[i] && lv < 3 && !b) {
          // the feast's path: pale flagstones set in the ground, joined to their neighbours
          const m = pathMask(u, v, 0.21, DIRS.map(([dx, dy]) => inMap(x + dx, y + dy) && (scar[idx(x + dx, y + dy)] || level(idx(x + dx, y + dy)) === 3)));
          if (m >= 0) c = scarPixel(m, X, Y);
          else if (lv > 0) { const m2 = pathMask(u, v, band, conn); if (m2 >= 0) c = pathPixel(lv, m2, X, Y); }
        } else if (lv > 0 && !b) {
          const m = pathMask(u, v, band, conn);
          if (m >= 0) c = pathPixel(lv, m, X, Y);
          // a ghost path shows the old village's flagstones through the wear
          if (m >= 0 && lv < 3 && S.ghost[i] === "1" && hash(X >> 1, Y, 9) < 0.35) c = hash(X, Y >> 1, 4) < 0.25 ? T.flagDk : T.flag;
        } else if (b && b.t !== "hearth" && lv === 0) {
          // a doorstep towards any trodden neighbour on the door's sides
          const m = pathMask(u, v, 0.13, conn.map((cn, k) => cn && (mask >> k) & 1 && level(idx(x + DIRS[k][0], y + DIRS[k][1])) > 0));
          if (m >= 0 && Math.hypot(u - 0.5, v - 0.5) > 0.3) c = pathPixel(1, m, X, Y);
        }
        // snow shows every footstep: the last day's steps, printed in the snow
        if (look.snow && !b && lv < 2 && S.foot[i] && sq >= 1.5 && hash(X, Y, 31) < Math.min(0.32, 0.05 * S.foot[i]) && (X + Y) % 2) c = T.snowPrint;
      }
      if (flood && flood[i]) c = bayer(X, Y) < 15 ? ((Y + (X >> 2)) % 5 === 0 ? T.floodLt : T.flood) : c;
      if (S.height && gr === ".") c = terrace(c, x, y, u, v, X, Y);
      put(X, Y, c);
    }
    // (a long bridge over the strait stands on the water: no cliff under it)
    if (gr !== "#" || S.soil[i] !== "c") cliffs(x, y, tx, ty, put, foam);
  }
  g.putImageData(img, 0, 0);
  // foam, two frames that alternate
  terrain.foam.forEach((c, f) => {
    const fg = c.getContext("2d");
    fg.clearRect(0, 0, W, H); fg.fillStyle = FOAM;
    for (const [fx, fy, k] of foam[0]) if ((k + f) % 3 !== 0) fg.fillRect(fx, fy, 1, 1);
    fg.globalAlpha = 0.6;
    for (const [fx, fy, k] of foam[1]) if ((k + f * 2) % 4 === 0) fg.fillRect(fx, fy, 1, 1);
  });
  terrain.dirty = false;
}

// what stands on a tile and casts a little shadow
const STANDING = "opbrklqhuUejnxgadcwHSBvz";

function grassPixel(x, y, X, Y) {
  const h = hash(X, Y), i = inMap(x, y) ? idx(x, y) : -1, soil = i >= 0 ? S.soil[i] : ".";
  if (soil === "a") {
    // sand: ripples and a shell or two
    if (h > 0.985) return T.shell;
    if ((Y + (X >> 2)) % 7 === 0 && hash(X >> 2, Y, 23) < 0.6) return T.sandDk;
    return (x + y) % 2 ? T.sand : T.sand2;
  }
  // winter (or the Snow north's snowfields): snow over everything but the marsh
  // pools, which ice over; a pebble pokes through the scree
  if (look.snow || soil === "i") {
    if (soil === "w" || soil === "W") { const p = hash(X >> 2, Y >> 1, 21); if (p > 0.62) return h > 0.85 ? T.iceLt : T.ice; }
    if (soil === "s" && h > 0.93) return T.pebbleDk;
    if (h < 0.04) return T.snowDk;
    return (x + y) % 2 ? T.snow : T.snow2;
  }
  if (soil === "s") {
    if (h > 0.9) return T.pebble;
    if (h < 0.06) return T.pebbleDk;
    return (x + y) % 2 ? T.scree : T.scree2;
  }
  if (soil === "w" || soil === "W") {
    // marsh: olive ground with standing water in blotches
    const p = hash(X >> 2, Y >> 1, 21);
    if (p > 0.62) return h > 0.9 ? T.poolLt : T.pool;
    return (x + y) % 2 ? T.marsh : T.marsh2;
  }
  if (meadow(x, y)) {
    if (h > (look.spring ? 0.965 : 0.985)) return T.flower[(hash(X, Y, 3) * 3) | 0];
    if (h < 0.08) return look.autumn ? T.autumnLt : T.meadowLt;
    return (x + y) % 2 ? T.meadow : T.meadow2;
  }
  // autumn: the grass turns, and fallen leaves lie about
  if (look.autumn) {
    if (h > 0.985) return T.leaf[(hash(X, Y, 5) * 3) | 0];
    if (h < 0.04) return T.autumnLt;
    return (x + y) % 2 ? T.autumn : T.autumn2;
  }
  // the Highlands' tops: short alpine turf
  if (S.height && i >= 0 && +S.height[i] >= 4) {
    if (h > 0.99) return T.flower[2];
    return (x + y) % 2 ? T.alpine : T.alpine2;
  }
  if (h < 0.035) return T.grassLt;
  if (h > 0.97) return T.grassDk;
  if (h > (look.spring ? 0.99 : 0.9965)) return T.flower[(hash(X, Y, 3) * 3) | 0];
  return (x + y) % 2 ? T.grass : T.grass2;
}

// the sea wall: big grey blocks in courses
function wallPixel(X, Y) {
  const row = Y >> 2, off = (row % 2) * 4;
  if (Y % 4 === 3 || (X + off) % 8 === 7) return T.wallDk;
  return hash((X + off) >> 3, row, 13) < 0.5 ? T.wall : T.wallLt;
}

// the Highlands: each level a touch paler (the tiles stand lifted, their faces
// drawn by cliffs())
function terrace(c, x, y, u, v, X, Y) {
  const h = heightAt(idx(x, y)), k = 1 + (h - 2) * 0.035;
  return [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
}

// a sandbar: dry sand while a spring tide is out, under a skin of sea otherwise;
// a causeway's planks over it at any tide
function sandbar(x, y, tx, ty, put, lv) {
  const plank = S.soil[idx(x, y)] === "W";
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    if (!inDiamond(px, py)) continue;
    const X = tx + px, Y = ty + py, u = ((py + 0.5) / 8 + (px + 0.5 - 16) / 16) / 2, v = ((py + 0.5) / 8 - (px + 0.5 - 16) / 16) / 2;
    let c = (Y + (X >> 2)) % 6 === 0 ? T.sandDk : hash(X, Y, 27) > 0.985 ? T.shell : (x + y) % 2 ? T.sand : T.sand2;
    if (look.tide && lv > 0 && Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)) < 0.2 && hash(X, Y, 29) < 0.5) c = T.sandDk;
    if (!look.tide) c = bayer(X, Y) < 9 ? ((X + Y) % 7 ? T.shallow : T.shallow2) : T.wetSand;
    if (plank) c = Math.abs(u - 0.5) < 0.3 || Math.abs(v - 0.5) < 0.3 ? (Math.floor((u + v) * 7) % 2 ? T.plank : T.plankLt) : c;
    put(X, Y, c);
  }
}

// -1 outside the path; otherwise how far inside the band (0 = at its edge)
function pathMask(u, v, w, conn) {
  const du = u - 0.5, dv = v - 0.5;
  let m = -1;
  // centre knot, slightly rounded
  if (Math.hypot(du, dv) < w * 1.25) m = Math.max(m, w * 1.25 - Math.hypot(du, dv));
  if (conn[0] && du >= 0 && Math.abs(dv) < w) m = Math.max(m, w - Math.abs(dv));
  if (conn[2] && du <= 0 && Math.abs(dv) < w) m = Math.max(m, w - Math.abs(dv));
  if (conn[1] && dv >= 0 && Math.abs(du) < w) m = Math.max(m, w - Math.abs(du));
  if (conn[3] && dv <= 0 && Math.abs(du) < w) m = Math.max(m, w - Math.abs(du));
  return m;
}

function pathPixel(lv, m, X, Y) {
  if (look.snow && lv < 3) {
    // trodden snow: a trail of prints, a path of grey slush
    if (lv === 1) return bayer(X, Y) < Math.min(14, 5 + (m / 0.15) * 16) ? T.snowPrint : T.snow;
    return m < 0.035 ? T.snowDk : hash(X, Y, 7) < 0.1 ? T.dirt : T.slush;
  }
  if (lv === 1) {
    // a trail: trampled grass, dithered, densest down the middle
    const k = Math.min(16, 6 + (m / 0.15) * 20);
    return bayer(X, Y) < k ? (hash(X, Y, 5) < 0.2 ? T.dirtDk : T.dirt) : T.grassDk;
  }
  if (lv === 2) return m < 0.035 ? T.dirtDk : hash(X, Y, 7) < 0.08 ? T.dirtLt : T.dirt;
  // cobbles: little 3x2 stones in running bond, or the island's pattern (a secret's gift)
  if (m < 0.03) return T.grout;
  if (look.pattern !== "cobble" && PATTERN[look.pattern]) return PATTERN[look.pattern](X, Y);
  const row = Y >> 1, col = (X + (row % 2) * 2) >> 2;
  if (Y % 2 === 1 && (X + row) % 4 === 0) return T.grout;
  if ((X + (row % 2) * 2) % 4 === 3) return look.snow ? T.snow : T.grout;
  return hash(col, row, 9) < 0.5 ? T.stone : T.stone2;
}
// cobble patterns (COSMETICS), chosen per island (S.pattern).  In winter the joints fill with snow
const P_COL = { herring: [hex("#c8b8a0"), hex("#b0a088")], flag: [hex("#dcd4c4"), hex("#cbc3b2"), hex("#d4ccbc")],
  brick: [hex("#b8644a"), hex("#a4553e"), hex("#c07458")], brickJoint: hex("#7a5a50"),
  pebble: [hex("#b8b0a0"), hex("#a09888"), hex("#c8b89c"), hex("#8e887c")] };
const joint = () => (look.snow ? T.snow : T.grout);
const PATTERN = {
  // bricks in zigzag rows, each row leaning the other way
  herringbone(X, Y) {
    const row = Y >> 1, k = row % 2 ? X + row * 2 : X - row * 2;
    if (((k % 6) + 6) % 6 === 0) return joint();
    return P_COL.herring[hash(Math.floor(k / 6), row, 3) < 0.5 ? 0 : 1];
  },
  // big pale slabs
  flagstone(X, Y) {
    const row = Y >> 2, x = X + (row % 2) * 4;
    if (Y % 4 === 3 || x % 8 === 7) return joint();
    return P_COL.flag[(hash(x >> 3, row, 5) * 3) | 0];
  },
  // red bricks in running bond
  brick(X, Y) {
    const row = Y >> 1, x = X + (row % 2) * 2;
    if (Y % 2 === 1 || x % 4 === 3) return look.snow ? T.snow : P_COL.brickJoint;
    return P_COL.brick[(hash(x >> 2, row, 7) * 3) | 0];
  },
  // round river pebbles of every shade
  pebbles(X, Y) {
    const row = Y >> 1, x = X + (row % 2 ? 2 : 0), px = x & 3, py = Y & 1;
    if ((px === 3 && py === 1) || (px === 0 && py === 1 && hash(x >> 2, row, 8) < 0.5)) return joint();
    return P_COL.pebble[(hash(x >> 2, row, 6) * 4) | 0];
  },
};
// the feast's scar: pale flagstones with grass in the joints
function scarPixel(m, X, Y) {
  const row = Y >> 1, x = X + (row % 2) * 3;
  if (m < 0.03) return look.snow ? T.snowDk : T.grassDk;
  if (Y % 2 === 1 && x % 6 === 5) return look.snow ? T.snow : T.grassDk;
  if (x % 6 === 5 || (Y % 2 === 1 && hash(x >> 1, row, 2) < 0.3)) return T.flagDk;
  return hash((x / 6) | 0, row, 11) < 0.5 ? T.flag : P_COL.flag[1];
}

function squarePixel(d, X, Y) {
  if (d > 1.4) return T.dirtDk;
  const h = hash(X, Y, 12);
  return h < 0.07 ? T.dirtLt : h > 0.96 ? T.stone2 : (X + Y) % 5 ? T.dirt : T.dirtLt;
}

function riverPixel(x, y, u, v, X, Y, bridge) {
  // banks on the edges facing land
  const landAt = (dx, dy) => isLand(x + dx, y + dy) && ground(x + dx, y + dy) !== "#";
  if ((u < 0.1 && landAt(-1, 0)) || (v < 0.1 && landAt(0, -1))) return T.bank;
  if ((u > 0.93 && landAt(1, 0)) || (v > 0.93 && landAt(0, 1))) return look.snow ? T.snowDk : T.grassDk;
  // frozen over (the Snow north's winter): ice with a crack or two, walkable
  if (look.frozen && !bridge) {
    const h = hash(X, Y, 19);
    if (h > 0.96 || (Y + X * 2) % 23 === 0) return T.iceDk;
    return h < 0.15 ? T.iceLt : T.ice;
  }
  // a long bridge over the strait: shallow sea under the planks
  if (bridge && inMap(x, y) && S.soil[idx(x, y)] === "c") {
    const alongU = isLand(x - 1, y) || isLand(x + 1, y), a = alongU ? v : u, b = alongU ? u : v;
    if (Math.abs(a - 0.5) < 0.3) return Math.abs(a - 0.5) > 0.26 ? T.plankDk : Math.floor(b * 9) % 2 ? T.plank : (hash(X, Y, 2) < 0.2 ? T.plankLt : T.plankDk);
    return bayer(X, Y) < 8 ? T.shallow : T.shallow2;
  }
  if (bridge) {
    // planks across the flow: the deck runs between the land neighbours
    const alongU = landAt(-1, 0) || landAt(1, 0) || ground(x - 1, y) === "#" || ground(x + 1, y) === "#";
    const a = alongU ? v : u, b = alongU ? u : v;
    if (Math.abs(a - 0.5) < 0.3) {
      if (Math.abs(a - 0.5) > 0.26) return T.plankDk;
      return Math.floor(b * 9) % 2 ? T.plank : (hash(X, Y, 2) < 0.2 ? T.plankLt : T.plankDk);
    }
  }
  const h = hash(X, Y, 1);
  if ((Y + Math.floor(X / 3)) % 5 === 0 && h < 0.5) return T.riverLt;
  return h < 0.1 ? T.riverDk : T.river;
}

function fieldPixel(b, u, v, X, Y) {
  if (u < 0.07 || v < 0.07 || u > 0.93 || v > 0.93) return T.soilDk;
  const stage = Math.min(2, b.age);
  const row = Math.floor(v * 7);
  if (look.snow) return row % 2 ? (hash(X, Y, 4) < 0.3 ? T.soilDk : T.snowDk) : T.snow; // resting under the snow
  if (row % 2) return hash(X, Y, 4) < 0.15 ? T.soilDk : T.soil;
  if (stage === 0 && bayer(X, Y) > 7) return T.soil;
  return stage === 2 && hash(X, Y, 6) < 0.18 ? T.cropLt : T.crop[stage];
}

// land edges facing the sea get an earthy cliff face and a foam line below it
// (a sandbar is lower than the land too: the face shows over it, without foam;
// a sea wall's face is dressed stone)
function cliffs(x, y, tx, ty, put, foam) {
  const low = (dx, dy) => ground(x + dx, y + dy) === "~" || ground(x + dx, y + dy) === "_", wet = (dx, dy) => ground(x + dx, y + dy) === "~";
  const wall = inMap(x, y) && S.soil[idx(x, y)] === "L", me = liftAt(x, y);
  // how far the ground falls away in front: to the sea (6, and the hill's height), or down a terrace
  const drop = (dx, dy) => (low(dx, dy) ? 6 + me : me - liftAt(x + dx, y + dy));
  const d1 = drop(0, 1), d2 = drop(1, 0);
  if (d1 > 0) for (let px = 0; px < 16; px++) face(tx + px, ty + 8 + Math.floor((px + 0.5) / 2), px, put, wet(0, 1) ? foam : null, wall, d1);
  if (d2 > 0) for (let px = 16; px < 32; px++) face(tx + px, ty + 16 - Math.ceil((px - 15.5) / 2), px, put, wet(1, 0) ? foam : null, wall, d2);
  // foam lapping the back edges too
  if (wet(0, -1)) for (let px = 16; px < 32; px++) foam[1].push([tx + px, ty + Math.floor((px - 16) / 2), px]);
  if (wet(-1, 0)) for (let px = 0; px < 16; px++) foam[1].push([tx + px, ty + 7 - Math.floor(px / 2), px]);
}
function face(X, top, px, put, foam, wall = false, H = 6) {
  put(X, top, wall ? T.wallLt : look.snow ? T.snow : T.cliffLip);
  for (let k = 1; k <= H; k++) {
    if (wall) { put(X, top + k, k === H || (k === 3 && px % 6) || (X + (k > 3 ? 3 : 0)) % 6 === 0 ? T.wallDk : T.wall); continue; }
    const c = k === H ? T.cliffDk : bayer(X, top + k) < (k * 16) / H - 4 ? T.cliff2 : T.cliff;
    put(X, top + k, hash(X, top + k, 8) < 0.07 ? T.cliffDk : c);
  }
  if (foam) foam[0].push([X, top + H + 1, px], [X, top + H + 2, px + 1]);
}

// the Atoll's lagoon: calm turquoise all over, pale where the sand shelves in
function lagoonTile(x, y, tx, ty, put) {
  let near = 0;
  for (const [dx, dy] of RING) if (isLand(x + dx, y + dy)) near++;
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    if (!inDiamond(px, py)) continue;
    const X = tx + px, Y = ty + py, h = hash(X, Y, 33);
    put(X, Y, near && bayer(X, Y) < 2 + near ? T.lagoonLt : (Y + (X >> 3)) % 9 === 0 && h < 0.5 ? T.lagoonLt : (x + y) % 2 ? T.lagoon : T.lagoon2);
  }
}
// a ferry's lane: its rope and a red buoy now and then, along the lane's axis
function laneTile(x, y, tx, ty, put) {
  const lane = (i, j) => inMap(i, j) && S.soil[idx(i, j)] === "f", along = lane(x - 1, y) || lane(x + 1, y) || !(lane(x, y - 1) || lane(x, y + 1));
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    if (!inDiamond(px, py)) continue;
    const u = ((py + 0.5) / 8 + (px + 0.5 - 16) / 16) / 2, v = ((py + 0.5) / 8 - (px + 0.5 - 16) / 16) / 2, a = along ? v : u, b = along ? u : v;
    if (Math.abs(a - 0.5) < 0.05 && Math.floor(b * 8) % 2) put(tx + px, ty + py, T.lane);
    if ((x + y) % 3 === 0 && Math.hypot(u - 0.5, v - 0.5) < 0.07) put(tx + px, ty + py, T.buoy);
  }
}

// sea tiles next to land are lighter, dithered: the shallows
function shallows(x, y, tx, ty, put) {
  let near = 0;
  for (const [dx, dy] of RING) if (isLand(x + dx, y + dy) || ground(x + dx, y + dy) === "=") near++;
  if (!near) return;
  const lvl = Math.min(9, 3 + near * 2);
  for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
    if (!inDiamond(px, py)) continue;
    const X = tx + px, Y = ty + py;
    if (bayer(X, Y) < lvl) put(X, Y, (X + Y) % 7 ? T.shallow : T.shallow2);
  }
}

// ------------------------------------------------------------------- sea

const glints = [];
function initGlints() {
  glints.length = 0;
  const r = rng(S.seed ^ 77);
  for (let i = 0; i < 120; i++) glints.push({ x: r() * 1.6 - 0.3, y: r() * 1.6 - 0.3, len: 2 + ((r() * 4) | 0), ph: r() * 6.28, sp: 0.4 + r() * 0.6 });
}

function drawSea(t) {
  rect(0, 0, VW, VH, SEA);
  // slow swell bands
  ctx.fillStyle = ditherPattern(3, SEA_DK);
  for (let y = (Math.floor(t * 4) % 24) - 24; y < VH; y += 24) ctx.fillRect(0, y, VW, 10);
  ctx.fillStyle = GLINT;
  for (const g of glints) {
    const a = Math.sin(t * g.sp + g.ph);
    if (a < 0.55) continue;
    const x = Math.round(g.x * VW + Math.sin(t * 0.2 + g.ph) * 6), y = Math.round(g.y * VH);
    const len = a > 0.85 ? g.len : Math.max(1, g.len - 2);
    ctx.fillRect(x, y, len, 1);
  }
}

// -------------------------------------------------------------- objects

// what stands on a tile, by its feature character (state.js)
const TREE_SPR = { o: "tree", p: "pine", b: "birch", r: "rock", k: "boulders", h: "heather", e: "reeds", l: "willow",
  u: "ruin", U: "ruin", q: "pillar", j: "fir", n: "spruce_snow", x: "windpine", g: "gorse", a: "alpine", d: "dunegrass",
  w: "driftwood", c: "shrub_bare", y: "seastack", v: "palm", z: "mangrove",
  // what the event deck leaves (PROPS)
  H: "hermit", S: "shrine", B: "boat", X: "wreck" };
const TREE_BASE = { tree: 11, pine: 11, birch: 11, rock: 11, boulders: 12, heather: 11, reeds: 11, willow: 11, ruin: 13, pillar: 11,
  fir: 11, spruce_snow: 11, windpine: 11, gorse: 11, alpine: 11, dunegrass: 11, driftwood: 11, shrub_bare: 11, seastack: 13,
  hermit: 14, shrine: 12, boat: 12, wreck: 13, palm: 11, mangrove: 12 };
// bottom of each building sprite, in pixels below the tile's top vertex
const BASE = { cottage: 14, cottage2: 14, hearth: 13, woodcutter: 14, fisher: 14, market: 14, well: 13, tavern: 15, lighthouse: 14,
  workshop: 14, house: 14, house2: 14, scaffold: 14, ship: 16, harbour: 15, quarry: 14, claypit: 14, shepherd: 14, lodge: 14, pier: 15,
  townhall: 15, grandmarket: 14, ferry: 15 };
// the season's version of a sprite, where build_assets.py made one: snow on the
// roofs and branches in winter, turned leaves in autumn
function seasonal(name) {
  const X = wx();
  if (X.snow && ATLAS.sprites[name + "_snow"]) return name + "_snow";
  if (X.season === 2 && ATLAS.sprites[name + "_autumn"]) return name + "_autumn";
  return name;
}
// a building site is a scaffold; houses and cottages come in two looks
const bSprite = b => (b.site ? "scaffold" : b.t === "cottage" ? (b.look % 2 ? "cottage2" : "cottage")
  : b.t === "house" ? (b.look % 2 ? "house2" : "house") : b.t);
const bFlip = b => b.look > 2 && isHome(b) && !b.site;
// street furniture stands on its tile's centre
const DECO_SPR = { s: "stall", b: "bench", l: "lamp", f: "flowers" };
const DECO_COL = { s: "#e8e0b0", b: "#a06a3a", l: "#2a2630", f: "#f0c040" };

// path view (P): trees and buildings lie down as flat footprints, like a map,
// so every path shows and it's plain which tiles block walking
const pathView = () => ui.paths && !ui.title;
const FOOTPRINT = { o: "#4f8a3c", p: "#3a6e3a", b: "#c8c070", r: "#8a8a80", k: "#7a7a70", h: "#b0a040", e: "#7a8a3a", l: "#8ab060",
  u: "#a09888", U: "#ffd66b", q: "#a09888", j: "#2f6040", n: "#dfe8ee", x: "#4a7a48", g: "#d8c040", a: "#b8c8a0", d: "#c8c890",
  w: "#b8b0a0", c: "#8a7058", y: "#6a6a70", H: "#a0b040", S: "#a09888", B: "#a0643a", X: "#a07a50", v: "#6ab04a", z: "#3a6a40" };

function drawFootprints() {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = feat(x, y);
    if (f === "." || f === "y") continue;
    const [sx, sy] = tileTop(x, y), [cx, cy] = [sx, sy + 8];
    // a round crown seen from above, with an ink rim
    rect(cx - 3, cy - 1, 7, 3, C.ink); rect(cx - 2, cy - 2, 5, 5, C.ink);
    rect(cx - 2, cy - 1, 5, 3, FOOTPRINT[f]);
  }
  for (let i = 0; i < N * N; i++) if (S.deco[i] !== ".") {
    const [sx, sy] = tileTop(i % N, (i / N) | 0);
    rect(sx - 2, sy + 6, 5, 4, C.ink); rect(sx - 1, sy + 7, 3, 2, DECO_COL[S.deco[i]]);
  }
  for (const b of S.b) {
    if (b.t === "field" && !b.site) continue;
    const [sx, sy] = tileTop(b.x, b.y);
    drawTile(sx, sy, b.site ? "#d8c090" : BUILD_COL[b.t], "solid");
    drawTile(sx, sy, C.ink, "edge");
    if (b.t === "hearth") flame(sx, sy + 12, b.id);
  }
}
// roof colours, so each footprint still says what stands there
const BUILD_COL = { hearth: "#6a5a58", cottage: "#e08a3a", woodcutter: "#8a9a40", fisher: "#3f9aa0", market: "#d8584a",
  well: "#8a8aa0", tavern: "#8a4a30", lighthouse: "#e8e0d0", house: "#f0a850", workshop: "#9a7048",
  ship: "#6a4a30", harbour: "#8a6a48", quarry: "#9a9a90", claypit: "#b0643a", shepherd: "#7aa050", lodge: "#8a5a38", pier: "#a07a50",
  townhall: "#c85040", grandmarket: "#d86a50", ferry: "#a07a50" };

// everything that stands up, with a depth to sort by and a draw function
function collectObjects(list) {
  if (pathView()) return;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = feat(x, y);
    if (f === ".") continue;
    const name = TREE_SPR[f];
    const jx = Math.round((hash(x, y, 11) - 0.5) * 4);
    list.push({ d: x + y, x, y, draw: () => {
      const [sx, sy] = tileTop(x, y), a = hearthVeil(x, y);
      ctx.globalAlpha = a;
      // a sea stack rises from the swell: it bobs with nothing, but the foam does
      if (f === "y" && Math.floor(now * 1.6 + x) % 2) rect(sx + jx - 5, sy + TREE_BASE[name] - 1, 10, 1, FOAM);
      spriteB(seasonal(name), sx + jx, sy + TREE_BASE[name], (x * 5 + y) % 2 === 0);
      // a restored ruin flies a little pennant; the castaways keep a fire by their boat
      if (f === "U") { rect(sx + jx + 6, sy - 14, 1, 12, C.ink); rect(sx + jx + 7, sy - 14, 5, 3, C.gold); }
      if (f === "B") flame(sx + jx - 8, sy + 13, x * 7 + y);
      ctx.globalAlpha = 1;
    } });
  }
  // the night merchant's cart by the tavern, while its stall is open
  const cart = merchantCart();
  if (cart) list.push({ d: cart[0] + cart[1], x: cart[0], y: cart[1], cart: true, draw: () => {
    const [sx, sy] = tileTop(cart[0], cart[1]);
    spriteB("merchant", sx, sy + 13, cart[2]);
  } });
  for (const b of S.b) {
    if (b.t === "field" && !b.site) continue;
    // buildings in front of the hearth thin out while villagers sit there
    list.push({ d: b.x + b.y, x: b.x, y: b.y, b, draw: () => drawBuilding(b, hearthVeil(b.x, b.y)) });
  }
  for (let i = 0; i < N * N; i++) {
    const ch = S.deco[i];
    if (ch === ".") continue;
    const x = i % N, y = (i / N) | 0, name = DECO_SPR[ch];
    list.push({ d: x + y, x, y, lamp: ch === "l" ? i : null, draw: () => {
      const [sx, sy] = tileTop(x, y);
      ctx.globalAlpha = hearthVeil(x, y);
      spriteB(name, sx, sy + 12, (x + y) % 2 === 1);
      ctx.globalAlpha = 1;
    } });
  }
}

// ghost: a placement preview at this alpha, the sprite only.  veil: drawn
// see-through (in front of the hearth gathering), smoke and all
function drawBuilding(b, veil = 1, ghost = false) {
  const [sx, sy] = tileTop(b.x, b.y), name = bSprite(b);
  const base = sy + (BASE[name] || 14);
  ctx.globalAlpha = veil;
  spriteB(ghost ? name : seasonal(name), sx, base, bFlip(b));
  ctx.globalAlpha = 1;
  if (ghost || b.site) return;
  if (b.t === "shepherd" && !day.on) drawFlockAtHome(b);
  // a working building puffs smoke; the hearth burns, with benches round it
  if (b.t === "hearth") { flame(sx, base - 9, b.id); drawBenches(sx, sy); }
  if (isHome(b) || b.t === "tavern" || b.t === "workshop" || b.t === "townhall") smoke(sx + (name === "cottage2" ? 5 : 6) * (bFlip(b) ? -1 : 1), base - spriteSize(name)[1] + 3, b.id);
}

// a campfire drawn in pixels: three hand-made frames and rising sparks.
// r: red, o: orange, y: yellow, w: white-hot core
const FLAME = [
  ["..y..", "..oy.", ".oyo.", ".oywo", "royyo", "rowyr", ".rrr."],
  [".y...", ".oy..", ".oyo.", "oywo.", "oyyor", "rowyr", ".rrr."],
  ["...y.", "..yo.", ".oyo.", "owyo.", "royyo", "rywor", ".rrr."],
];
const FLAME_COL = { r: "#d8482a", o: "#ff9a40", y: "#ffd66b", w: "#fff4c8" };
function flame(cx, by, seed) {
  const f = FLAME[Math.floor(now * 7 + seed) % 3];
  f.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] !== ".") rect(cx - 2 + i, by - 7 + j, 1, 1, FLAME_COL[row[i]]); });
  for (let i = 0; i < 2; i++) {
    const t = (now * 0.9 + i * 0.5) % 1;
    if (t < 0.7) rect(Math.round(cx + Math.sin((t + i) * 9) * 1.5), Math.round(by - 8 - t * 9), 1, 1, t < 0.35 ? FLAME_COL.y : FLAME_COL.o);
  }
}

function smoke(x, y, seed) {
  for (let i = 0; i < 3; i++) {
    const t = (now * 0.5 + i / 3 + seed * 0.37) % 1;
    const px = Math.round(x + Math.sin((t + seed) * 6) * 2 + t * 3), py = Math.round(y - t * 12);
    ctx.globalAlpha = 0.7 * (1 - t);
    rect(px, py, t > 0.5 ? 2 : 1, t > 0.5 ? 2 : 1, "#f4f0ea");
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- fish

// fish under the water round the island: shoals of little ones, a big dark one now and
// then, a ray gliding, bright ones in a lagoon; and every few seconds one jumps near the
// shore.  Drawn as flat shapes in the water's own darker colour, so they read as below
// the surface.  Only a look: they are seeded by the island and swim on the clock
const FISH_KIND = [
  { w: 3, rows: ["###"], n: 5, col: "#2f7fa0", sp: 0.5 },          // a shoal of little fish
  { w: 5, rows: [".###.", "#####", ".#..."], n: 1, col: "#2a6f90", sp: 0.25 }, // a big one
  { w: 5, rows: ["..#..", ".###.", "#####", "..#.."], n: 1, col: "#2a6a8a", sp: 0.15 }, // a ray
];
let fishSwarm = null;
function initFish() {
  const r = rng(S.seed ^ 0xf15), n = 16 + (S.traits.includes("storm") ? 8 : 0), list = [];
  // round the island and a little way out past its edge, in the water
  for (let k = 0, tries = 0; list.length < n && tries < 400; tries++) {
    const x = r() * (N + 8) - 4, y = r() * (N + 8) - 4;
    if (ground(Math.floor(x), Math.floor(y)) !== "~") continue;
    list.push({ k: k % 3 === 2 ? (k % 6 === 5 ? 2 : 1) : 0, x, y, rx: 1 + r() * 2.5, ry: 1 + r() * 2.5, ph: r() * 6.28, sp: 0.06 + r() * 0.08 });
    k++;
  }
  fishSwarm = { seed: S.seed, n: N, list };
}
function drawFish() {
  if (!fishSwarm || fishSwarm.seed !== S.seed || fishSwarm.n !== N) initFish();
  const sea = openSea(), wet = (x, y) => ground(Math.floor(x), Math.floor(y)) === "~";
  const lagoonAt = (x, y) => wet(x, y) && inMap(Math.floor(x), Math.floor(y)) && !sea[idx(Math.floor(x), Math.floor(y))];
  for (const f of fishSwarm.list) {
    const K = FISH_KIND[f.k], a = now * f.sp + f.ph;
    const fx = f.x + Math.cos(a) * f.rx, fy = f.y + Math.sin(a * 1.3) * f.ry, dir = -Math.sin(a) * f.rx - Math.cos(a * 1.3) * 1.3 * f.ry < 0; // swimming left on screen
    for (let m = 0; m < K.n; m++) {
      const mx = fx + (m % 3) * 0.18 - 0.2, my = fy + Math.floor(m / 3) * 0.2 + (m % 2) * 0.1;
      if (!wet(mx, my)) continue;
      const sx = Math.round(cam.x + (mx - my) * 16), sy = Math.round(cam.y + (mx + my) * 8 + 8), col = lagoonAt(mx, my) ? ["#e8904a", "#f0d050", "#e86a8a"][(f.k + m) % 3] : K.col;
      ctx.globalAlpha = lagoonAt(mx, my) ? 0.8 : 0.55;
      K.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") rect(sx + (dir ? K.w - 1 - i : i), sy + j, 1, 1, col); });
    }
  }
  ctx.globalAlpha = 1;
  // a fish jumps: every few seconds, near a stretch of shore
  const T0 = 2.6, k = Math.floor(now / T0), t = (now % T0) / 1.1;
  if (t < 1) {
    const r = rng((S.seed ^ (k * 7919)) >>> 0);
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.floor(r() * N), y = Math.floor(r() * N);
      if (ground(x, y) !== "~" || !DIRS.some(([dx, dy]) => isLand(x + dx, y + dy) || ground(x + dx, y + dy) === "~" && isLand(x + 2 * dx, y + 2 * dy))) continue;
      const [sx, sy] = tileMid(x, y), jx = Math.round(sx - 6 + t * 12), jy = Math.round(sy - Math.sin(t * Math.PI) * 9);
      if (t < 0.08 || t > 0.92) { rect(sx - 7 + (t > 0.5 ? 12 : 0), sy, 3, 1, FOAM); rect(sx - 6 + (t > 0.5 ? 12 : 0), sy - 1, 1, 1, FOAM); }
      else { rect(jx - 1, jy, 3, 1, "#d8e8f0"); rect(jx + (t < 0.5 ? 2 : -2), jy + (t < 0.5 ? -1 : 1), 1, 1, "#9ab8c8"); rect(jx, jy + 1, 1, 1, "#7a98a8"); }
      break;
    }
  }
}

// on the sea: the pirates' ship while they bury their chest; the Grand Festival's fleet
function collectSeaMoments(list) {
  const E = S.ev && S.ev.cur;
  if (E && E.id === "treasure" && E.ship >= 0 && S.day - E.day < 2 && !visiting) {
    const x = E.ship % N, y = (E.ship / N) | 0;
    list.push({ d: x + y, draw: () => {
      const [sx, sy] = tileTop(x, y), spr = ATLAS.sprites.pirateship ? "pirateship" : "ship";
      spriteB(spr, sx, sy + 14 + Math.round(Math.sin(now * 2)), x < N / 2);
    } });
  }
  if (grandFleet.until > now) for (const f of grandFleet.boats) {
    const k = Math.max(0, Math.min(1, (now - f.t0) / f.dur)), e = 1 - (1 - k) * (1 - k);
    const x = f.from[0] + (f.to[0] - f.from[0]) * e, y = f.from[1] + (f.to[1] - f.from[1]) * e;
    list.push({ d: x + y, draw: () => {
      const sx = cam.x + (x - y) * 16, sy = cam.y + (x + y) * 8 + 11 + Math.round(Math.sin(now * 3 + f.ph));
      spriteB(f.big ? "ship" : "boat", sx, sy, f.to[0] - f.from[0] - (f.to[1] - f.from[1]) > 0);
      // a pennant in the island's colour on every mast
      rect(sx - 1, sy - spriteSize(f.big ? "ship" : "boat")[1] - 3, 4, 2, f.col);
      if (f.name && k > 0.6) text(f.name, sx, sy - spriteSize(f.big ? "ship" : "boat")[1] - 12, { colour: C.gold, align: "center", outline: true });
    } });
  }
}
// the Grand Festival (main.js): a boat from every settled island, and a crowd of sails
const grandFleet = { until: 0, boats: [] };

// ------------------------------------------------------------- villagers

const HAIR = ["#3b2a20", "#7a4a2a", "#e0c070", "#c05a30", "#2a2a2a", "#d8d0c8"];
const SKIN = ["#f1c7a0", "#d9a577", "#a8704a", "#6e4630"];
const SHIRT = ["#e05a4a", "#4a8ad8", "#f0d050", "#6ab04a", "#b070d0", "#f0f0f0", "#e08a3a", "#48c0b0"];
const PANTS = ["#4a3a5a", "#3a4a6a", "#6a4a3a", "#2f5a4a"];
const FIG = [
  [".hh.", ".ss.", "bbbb", "sbbs", ".bb.", ".pp.", ".pp."],
  [".hh.", ".ss.", "bbbb", "sbbs", ".bb.", ".pp.", "p..p"],
  // sitting, knees forward (drawn one pixel lower, feet on the bench)
  [".hh..", ".ss..", "bbbb.", "sbbs.", ".pppp", ".p..p"],
];
const CARRY = { food: ["#f2c75c", "#c89a30"], wood: ["#a0643a", "#6e4024"], coin: ["#ffe27a", "#c8a030"], fish: ["#a8d0e8", "#6a90b0"],
  goods: ["#e0c08c", "#9a7048"] };

// hats (COSMETICS): drawn over the hair, in the figure's canvas (8x10, head at x 3-4, y 2)
const HATS = {
  strawhat: ["", "...yy...", ".yyyyyy."], knitcap: ["", "...rr...", "..rwrr.."],
  flowers: ["", "..pypy..", ""], souwester: ["", "..oooo..", ".oooooo.", "..o..o.."],
  tricorn: ["", "..kkkk..", "kkgkkgkk"],
};
const HAT_COL = { y: "#e8c86a", r: "#c84848", w: "#f4ece0", p: "#f7a0c0", o: "#f0c030", k: "#2a2630", g: "#d8b048" };
// which hat a villager wears: some of them wear one of the hats found (PROFILE), none
// while the hats are put away
function hatFor(look) {
  if (typeof PROFILE === "undefined" || PROFILE.hatsOff) return null;
  const owned = Object.keys(HATS).filter(h => PROFILE.cosmetics.includes(h));
  if (!owned.length) return null;
  return owned[(hash(look, 3, 17) * (owned.length + 2)) | 0] || null;
}
const figCache = new Map();
function figure(look, frame, carry, hat = hatFor(look)) {
  const key = look + ":" + frame + ":" + carry + ":" + hat;
  if (figCache.has(key)) return figCache.get(key);
  const col = { h: HAIR[look % HAIR.length], s: SKIN[(look >> 2) % SKIN.length], b: SHIRT[(look >> 1) % SHIRT.length], p: PANTS[(look >> 3) % PANTS.length] };
  const c = document.createElement("canvas"); c.width = 8; c.height = 10;
  const g = c.getContext("2d");
  const rows = FIG[frame];
  const dots = [];
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") dots.push([i + 2, j + 2, col[row[i]]]); });
  if (carry && CARRY[carry]) { dots.push([5, 4, CARRY[carry][0]], [6, 4, CARRY[carry][0]], [5, 5, CARRY[carry][1]], [6, 5, CARRY[carry][1]]); }
  if (hat) HATS[hat].forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== ".") dots.push([x, y, HAT_COL[row[x]]]); });
  g.fillStyle = C.ink;
  for (const [x, y] of dots) for (const [dx, dy] of DIRS) g.fillRect(x + dx, y + dy, 1, 1);
  for (const [x, y, cl] of dots) { g.fillStyle = cl; g.fillRect(x, y, 1, 1); }
  figCache.set(key, c);
  return c;
}
// sheep: a pixel map like FIG.  w wool, k face and legs, s the wool's shade
const SHEEP = [
  [".www..", "wwwwkk", "swwwkk", ".k.k.."],
  [".www..", "wwwwkk", "swwwkk", "k...k."],
];
const SHEEP_COL = { w: "#f6f2ea", s: "#d8d0c4", k: "#3a3034" };
const sheepCache = [];
function drawSheep(x, y, frame, flip) {
  if (!sheepCache[frame]) {
    const c = document.createElement("canvas"); c.width = 8; c.height = 6;
    const g = c.getContext("2d"), dots = [];
    SHEEP[frame].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") dots.push([i + 1, j + 1, SHEEP_COL[row[i]]]); });
    g.fillStyle = C.ink;
    for (const [px, py] of dots) for (const [dx, dy] of DIRS) g.fillRect(px + dx, py + dy, 1, 1);
    for (const [px, py, cl] of dots) { g.fillStyle = cl; g.fillRect(px, py, 1, 1); }
    sheepCache[frame] = c;
  }
  x = Math.round(x); y = Math.round(y);
  if (flip) { ctx.save(); ctx.translate(x + 4, 0); ctx.scale(-1, 1); ctx.drawImage(sheepCache[frame], 0, y - 5); ctx.restore(); }
  else ctx.drawImage(sheepCache[frame], x - 4, y - 5);
}
// between days the flock grazes by its hut
function drawFlockAtHome(b) {
  const [sx, sy] = tileTop(b.x, b.y);
  for (let k = 0; k < R.flock; k++) {
    const ox = [14, 20, 8][k], oy = [15, 11, 18][k], bob = Math.floor(now * 1.5 + k * 1.3) % 5 === 0 ? 1 : 0;
    drawSheep(sx + ox, sy + oy, bob, k === 1);
  }
}

// deer: the migrating herd (events.js), a pixel map like the sheep.  b coat, d its
// shade, w the white tail, k legs and ears
const DEER = [
  [".....k.", "w...bbk", "bbbbbb.", ".dddd..", ".k..k.."],
  [".....k.", "w...bbk", "bbbbbb.", ".dddd..", "k....k."],
];
const DEER_COL = { b: "#b07840", d: "#8a5a30", w: "#f4ece0", k: "#4a3024" };
const deerCache = [];
function drawDeer(x, y, frame, flip) {
  if (!deerCache[frame]) {
    const c = document.createElement("canvas"); c.width = 9; c.height = 7;
    const g = c.getContext("2d"), dots = [];
    DEER[frame].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") dots.push([i + 1, j + 1, DEER_COL[row[i]]]); });
    g.fillStyle = C.ink;
    for (const [px, py] of dots) for (const [dx, dy] of DIRS) g.fillRect(px + dx, py + dy, 1, 1);
    for (const [px, py, cl] of dots) { g.fillStyle = cl; g.fillRect(px, py, 1, 1); }
    deerCache[frame] = c;
  }
  x = Math.round(x); y = Math.round(y);
  if (flip) { ctx.save(); ctx.translate(x + 5, 0); ctx.scale(-1, 1); ctx.drawImage(deerCache[frame], 0, y - 6); ctx.restore(); }
  else ctx.drawImage(deerCache[frame], x - 4, y - 6);
}

// feet at (x, y)
function drawVillager(look, x, y, frame, flip, carry) {
  const f = figure(look, frame, carry);
  x = Math.round(x); y = Math.round(y);
  if (flip) { ctx.save(); ctx.translate(x + 4, 0); ctx.scale(-1, 1); ctx.drawImage(f, 0, y - 9); ctx.restore(); }
  else ctx.drawImage(f, x - 4, y - 9);
}

// ------------------------------------------------------------- particles

const fx = { floats: [], parts: [], motes: [], prints: [] };

// text and sparks float over the island (world view) or, with `ui`, over the menus
// (screen-centred news: a milestone, a secret, landfall)
function floatText(x, y, str, colour = C.text, font = "caps", icon = null, life = 1.6, ui = false) {
  fx.floats.push({ x, y, str, colour, font, icon, t: 0, life, ui });
}
const screenText = (x, y, str, colour, font = "caps", life = 1.6) => floatText(x, y, str, colour, font, null, life, true);
function burst(x, y, colour, n = 12, speed = 40, ui = false) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - speed * 0.5, t: 0, life: 0.6 + Math.random() * 0.6, colour, ui });
  }
}
// a mote flying from a point on the island to a HUD anchor; onLand runs when it arrives
function sendMote(x, y, anchor, colour, onLand = null) {
  const [ux, uy] = worldToUi(x, y);
  fx.motes.push({ x0: ux, y0: uy, anchor, colour, t: 0, dur: 0.55 + Math.random() * 0.25, onLand });
}
const hudAnchor = {};

// the floats and sparks of one view; the motes fly over the menus
function drawFx(dt, ui = false) {
  if (!ui) {
    for (const p of fx.prints) p.t += dt;
    fx.prints = fx.prints.filter(p => p.t < 3);
  }
  for (const p of fx.parts) if (p.ui === ui) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; }
  fx.parts = fx.parts.filter(p => p.t < p.life);
  for (const p of fx.parts) if (p.ui === ui) rect(Math.round(p.x), Math.round(p.y), 1, 1, p.colour);

  for (const f of fx.floats) {
    if (f.ui !== ui) continue;
    f.t += dt;
    const k = f.t / f.life, y = Math.round(f.y - Math.min(1, k * 2) * 10);
    if (k > 0.8 && Math.floor(f.t * 12) % 2) continue; // blink out
    let x = f.x;
    // outlined, so the numbers read over grass, roofs and sea alike
    if (f.icon) { const w = textWidth(f.str, f.font) + 12; x = f.x - w / 2; spriteB(f.icon, x + 5, y + 8); text(f.str, x + 12, y, { font: f.font, colour: f.colour, outline: true }); }
    else text(f.str, x, y, { font: f.font, colour: f.colour, align: "center", outline: true });
  }
  fx.floats = fx.floats.filter(f => f.t < f.life);
  if (!ui) return;

  for (const m of fx.motes) {
    m.t += dt;
    const a = hudAnchor[m.anchor] || [VW / 2, 10];
    const k = Math.min(1, m.t / m.dur), e = k * k * (3 - 2 * k);
    const mx = (m.x0 + a[0]) / 2, my = Math.min(m.y0, a[1]) - 30;
    const u = 1 - e, x = u * u * m.x0 + 2 * u * e * mx + e * e * a[0], y = u * u * m.y0 + 2 * u * e * my + e * e * a[1];
    rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, C.ink);
    rect(Math.round(x), Math.round(y), 1, 1, "#ffffff");
    rect(Math.round(x) - 1, Math.round(y), 1, 1, m.colour); rect(Math.round(x) + 1, Math.round(y), 1, 1, m.colour);
    rect(Math.round(x), Math.round(y) - 1, 1, 1, m.colour); rect(Math.round(x), Math.round(y) + 1, 1, 1, m.colour);
    if (k >= 1 && !m.done) { m.done = true; if (m.onLand) m.onLand(); ui_bump(m.anchor); }
  }
  fx.motes = fx.motes.filter(m => !m.done);
}
const ui_bump = k => { ui.bump[k] = 0.15; };

// --------------------------------------------------------------- the frame

const night = { k: 0 }; // 0 day .. 1 night, set by the day playback

function drawWorld(dt) {
  if (terrain.dirty) buildTerrain();
  updateHearthFade(dt);
  drawSea(now);
  drawHorizon();
  const ox = cam.x - terrain.ox, oy = cam.y - terrain.oy;
  ctx.drawImage(terrain.foam[Math.floor(now * 1.6) % 2], ox, oy);
  ctx.drawImage(terrain.cvs, ox, oy);
  drawFish();
  if (pathView()) drawFootprints();
  drawGroundOverlay();

  // footprints fade on the ground
  for (const p of fx.prints) {
    ctx.globalAlpha = Math.max(0, 0.7 - p.t / 4);
    const [sx, sy] = tileTop(p.x, p.y);
    rect(Math.round(sx + p.ox), Math.round(sy + p.oy), 1, 1, "#7b5a36");
    ctx.globalAlpha = 1;
  }

  const list = [];
  collectObjects(list);
  collectWalkers(list);
  collectCrowd(list);
  collectBoats(list);
  collectSeaMoments(list);
  list.sort((a, b) => a.d - b.d || (a.w ? 1 : 0) - (b.w ? 1 : 0));
  // at night the lamps go into their own layer in the same back-to-front order:
  // each thing erases the light behind it (its own shape), then adds its own, so
  // a window never shines through a roof or a tree in front of it
  const lights = night.k > 0.3 ? lightLayer() : null;
  for (const o of list) {
    o.draw();
    if (lights) withCtx(lights, () => {
      lights.globalCompositeOperation = "destination-out";
      o.draw();
      lights.globalCompositeOperation = "source-over";
      if (o.b) lamps(o.b);
      if (o.lamp !== null && o.lamp !== undefined) streetLamp(o.lamp);
      if (o.cart) cartLantern();
    });
  }
  drawOverObjects();

  drawWeather();
  drawNight(lights);
  drawFx(dt);
}

// rain on a stormy day, snow falling on some winter days: flat pixels over the
// island, and a flat grey wash in a storm
function drawWeather() {
  if (ui.title || visiting) return;
  const X = day.on ? day.P.weather : wx();
  if (X.storm) {
    ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.3; rect(0, 0, VW, VH, "#8a94ac");
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#d8e8f4";
    for (let k = 0; k < 140; k++) {
      const x = Math.floor(hash(k, 1, 40) * VW + now * 30) % VW, y = Math.floor(hash(k, 2, 40) * VH + now * (160 + k % 40)) % VH;
      ctx.fillRect(x, y, 1, 3);
    }
  } else if (X.snow && hash(X.day, 3, 41) < 0.6) {
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 90; k++) {
      const s = 8 + (k % 7) * 2, x = Math.floor(hash(k, 1, 42) * VW + Math.sin(now * 0.8 + k) * 6) % VW, y = Math.floor(hash(k, 2, 42) * VH + now * s) % VH;
      ctx.fillRect((x + VW) % VW, y, 1, 1);
    }
  }
}

// lights come on one home at a time as dusk deepens
const lampOn = b => Math.max(0, Math.min(1, (night.k - 0.3 - hash(b.id, 7) * 0.3) * 4));
const lampFlicker = b => 0.88 + 0.12 * Math.sin(now * 6 + b.id * 1.7);

const lightCvs = document.createElement("canvas");
function lightLayer() {
  if (lightCvs.width !== VW || lightCvs.height !== VH) { lightCvs.width = VW; lightCvs.height = VH; }
  const g = lightCvs.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, VW, VH);
  return g;
}
// what a building adds to the light layer: its lit window panes (the "<name>_lit"
// sprites), or the hearth's fire
function lamps(b) {
  const on = lampOn(b);
  if (!on) return;
  const [sx, sy] = tileTop(b.x, b.y), name = bSprite(b), base = sy + (BASE[name] || 14);
  if (b.t === "hearth") return flame(sx, base - 9, b.id);
  if (!ATLAS.sprites[name + "_lit"] || b.site) return;
  ctx.globalAlpha = on * lampFlicker(b) * hearthVeil(b.x, b.y);
  spriteB(name + "_lit", sx, base, bFlip(b));
  ctx.globalAlpha = 1;
}
// the merchant's cart: on a free tile by the tavern while the stall is open; its
// lantern is lit in code, like the street lamps
function merchantCart() {
  if (!S.shop || S.shop.day !== S.day || visiting) return null;
  const t = S.b.find(b => b.t === "tavern" && !b.site);
  if (!t) return null;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, 0], [0, -1]]) if (walkable(t.x + dx, t.y + dy) && !onSquare(t.x + dx, t.y + dy)) return [t.x + dx, t.y + dy, dx < dy];
  return null;
}
function cartLantern() {
  const cart = merchantCart(), on = cart && lampOn({ id: 4999 });
  if (!on) return;
  const [sx, sy] = tileTop(cart[0], cart[1]), lx = sx + (cart[2] ? 6 : -7), ly = sy + 13 - 12;
  ctx.globalAlpha = on;
  rect(lx - 1, ly, 3, 3, "#ffd890"); rect(lx, ly + 1, 1, 1, "#fff8e0");
  ctx.globalAlpha = 1;
}
// a street lamp's lantern, into the light layer (the pool on the ground is drawNight's)
const streetLampOn = i => lampOn({ id: 5000 + i });
function streetLamp(i) {
  const on = streetLampOn(i);
  if (!on) return;
  const [sx, sy] = tileTop(i % N, (i / N) | 0), top = sy + 12 - spriteSize("lamp")[1];
  ctx.globalAlpha = on;
  rect(sx - 1, top + 2, 3, 3, "#ffd890"); rect(sx, top + 3, 1, 1, "#fff8e0");
  ctx.globalAlpha = 1;
}

// dusk and night: a flat multiply tint, then the light layer, pools of firelight
// and the lighthouse beam on top
function drawNight(lights) {
  const k = night.k;
  if (k <= 0.01) return;
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = Math.min(1, k * 1.1);
  rect(0, 0, VW, VH, night.col || "#5a64a8");
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  for (const b of S.b) {
    const on = lampOn(b);
    if (!on) continue;
    const [sx, sy] = tileTop(b.x, b.y), name = bSprite(b), base = sy + (BASE[name] || 14);
    const flick = lampFlicker(b);
    if (b.t === "hearth") lightPool(sx, sy + 9, 34, "#ff9a40", on * flick);
    if (b.t === "tavern") lightPool(sx, sy + 12, 22, "#ffc060", on * flick);
    // the lighthouse shines while its keeper tends the lamp
    if (b.t === "lighthouse" && !b.site && ((day.on ? day.P : forecast) || {}).lit) {
      const h = spriteSize("lighthouse")[1], ly = base - h + 7;
      lightPool(sx, ly, 16, "#ffe8a0", on);
      // the sweeping beam: a dotted ray turning with time
      const a = now * 1.3, len = 70;
      ctx.fillStyle = "#fff0b0";
      for (let r = 6; r < len; r += 2) {
        if (bayer(r, 0) > 16 * (1 - r / len)) continue;
        ctx.globalAlpha = 0.5 * on * (1 - r / len);
        ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(ly + Math.sin(a) * r * 0.5), 2, 1);
      }
      ctx.globalAlpha = 1;
    }
  }
  for (let i = 0; i < N * N; i++) if (S.deco[i] === "l") {
    const on = streetLampOn(i);
    if (on) { const [sx, sy] = tileTop(i % N, (i / N) | 0); lightPool(sx, sy + 10, 16, "#ffd890", on); }
  }
  const cart = merchantCart(), cartOn = cart && lampOn({ id: 4999 });
  if (cartOn) { const [sx, sy] = tileTop(cart[0], cart[1]); lightPool(sx, sy + 10, 20, "#ffd890", cartOn); }
  if (lights) ctx.drawImage(lightCvs, 0, 0);
}

// a pool of light on the ground: three flat, nested ellipses screened over the
// night, so it brightens in clean bands instead of a dither
function lightPool(cx, cy, r, colour, alpha) {
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = colour;
  for (const [f, a] of [[1, 0.1], [0.68, 0.12], [0.4, 0.16]]) {
    const rx = r * f, ry = rx / 2;
    ctx.globalAlpha = a * alpha;
    for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) {
      const hw = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2));
      ctx.fillRect(Math.round(cx) - hw, Math.round(cy) + y, hw * 2, 1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
