/* A player bot: plays one day's building the way a careful human would.
 * Classic script over the game's globals (S, BD, plan, build, ...): it drives
 * ?demo and the dev menu (dev.js) in the page, tools/record.mjs, and headless
 * long games in Node (tools/longplay.mjs).
 *
 * botTurn() builds what the village needs today and returns what it built.
 * It never walls anything in: a placement is only taken if every building can
 * still be reached on foot from the hearth.
 */
"use strict";

// dense: play for the biggest village, not just the festival: late on, surplus
// workplaces are pulled down to make room for homes
const bot = { log: [], dense: true, unserved: null, flood: null };

// walkable land reachable from the hearth, and how many buildings still are (a thaw
// or the tide going out can cut some off for a while: that isn't the bot's doing)
function botReach() {
  const h = S.b.find(b => b.t === "hearth"), d = costsFrom(h.x, h.y);
  let land = 0;
  for (let i = 0; i < N * N; i++) if (d[i] < Infinity && walkable(i % N, (i / N) | 0)) land++;
  const reached = S.b.filter(b => b === h || d[idx(b.x, b.y)] < Infinity).length;
  return { land, reached, all: reached === S.b.length };
}
// try a placement: build, check, undo if it walls a building or a patch of land in
function botTry(t, x, y) {
  const was = botReach(), before = was.land;
  const snap = { b: S.b.slice(), feat: S.feat, ground: S.ground, cob: S.cob, wear: S.wear.slice(),
    food: S.food, wood: S.wood, coin: S.coin, goods: S.goods, nextId: S.nextId, built: S.stats.built, planted: S.stats.planted };
  if (!build(BD[t], x, y)) return false;
  const r = botReach();
  if (r.reached >= was.reached + (S.b.length > snap.b.length ? 1 : 0) && r.land >= before - 4) return true; // a tiny dead-end pocket may go
  Object.assign(S, { b: snap.b, feat: snap.feat, ground: snap.ground, cob: snap.cob, wear: snap.wear,
    food: snap.food, wood: snap.wood, coin: snap.coin, goods: snap.goods, nextId: snap.nextId });
  S.stats.built = snap.built; S.stats.planted = snap.planted;
  reindex();
  return false;
}

const botHearth = () => S.b.find(b => b.t === "hearth");
const onPath = (x, y) => level(idx(x, y)) > 0;
// free walkable neighbours: a tile boxed in on all sides is a poor home
const openSides = (x, y) => DIRS.filter(([dx, dy]) => walkable(x + dx, y + dy)).length;
const footAround = (x, y) => [[0, 0], ...RING].reduce((a, [dx, dy]) => a + (inMap(x + dx, y + dy) ? S.foot[idx(x + dx, y + dy)] : 0), 0);

// how good a tile is for a building type (higher is better), or -Infinity
function botScore(t, x, y, F, dh) {
  const h = botHearth(), dist = Math.abs(x - h.x) + Math.abs(y - h.y), walk = dh[idx(x, y)];
  if (walk === Infinity) return -Infinity;
  let s = -walk * 0.4;
  if (openSides(x, y) < 2) s -= 4;
  if (onPath(x, y)) s -= 2 + level(idx(x, y)) * 2; // keep the worn paths
  if (t === "cottage") {
    s += (streetFront(x, y) ? 4 : 0) + (nearWell(x, y) ? 4 : 0);
    if (meadow(x, y)) s -= 3; // keep meadows for fields
  } else if (t === "field") {
    s += (meadow(x, y) ? 5 : 0) + fieldsBeside(x, y) * 2 - Math.max(0, walk - 5) * 1.2;
    if (bot.flood && bot.flood[idx(x, y)]) s -= 4; // storms would drown it
  } else if (t === "woodcutter") {
    const n = Math.min(4, Math.floor(treesNear(x, y) / 2));
    if (n < 2) return -Infinity;
    s += n * 3 - S.b.filter(b => b.t === "woodcutter" && cheb(b, { x, y }) <= 2).length * 3 - Math.max(0, walk - 5) * 1.2;
  } else if (t === "fisher") {
    // a stretch of coast feeds about one and a half fishers
    const st = stretchOf(x, y), mates = S.b.filter(b => b.t === "fisher" && stretchOf(b.x, b.y) === st).length;
    if (mates >= 2) return -Infinity;
    s -= Math.max(0, walk - 5) * 1.2 + mates * 6;
  } else if (t === "market") {
    let f = footAround(x, y);
    if (S.b.some(b => b.t === "market" && cheb(b, { x, y }) <= 3)) f *= 0.3;
    // most of all, where villagers pass who pass no market yet (their homes can't be houses)
    const u = bot.unserved ? [[0, 0], ...RING].reduce((a, [dx, dy]) => a + (bot.unserved.get(idx(x + dx, y + dy)) || 0), 0) : 0;
    s += f * 1.5 + u * 4 + walk * 0.3;
  } else if (t === "workshop") {
    s -= Math.max(0, walk - 4);
    if (meadow(x, y)) s -= 3;
  } else if (t === "well") {
    const n = S.b.filter(c => isHome(c) && cheb(c, { x, y }) <= R.wellRadius && !nearWell(c.x, c.y)).length;
    if (n < 2) return -Infinity;
    s += n * 4;
  } else if (t === "tavern") {
    const n = S.b.filter(b => BD[b.t].jobs && b.t !== "tavern" && Math.abs(b.x - x) + Math.abs(b.y - y) <= 4).length;
    s += n * 2;
  } else if (t === "lighthouse" || t === "ship" || t === "harbour") s = -dist * 0.1;
  else if (t === "townhall") s += footAround(x, y) * 0.5 - dist * 0.5;
  else if (t === "grandmarket") {
    let f = footAround(x, y);
    if (S.b.some(b => (b.t === "market" || b.t === "grandmarket") && cheb(b, { x, y }) <= 3)) f *= 0.3;
    s += f * 1.5;
  } else if (t === "ferry") {
    // a lane that saves a long walk round: its far end is far from the hearth on foot
    // reached on foot from an open tile (not through a house), with a lane across
    const lane = ferryLane(x, y);
    if (!lane || !DIRS.some(([dx, dy]) => walkable(x + dx, y + dy) && dh[idx(x + dx, y + dy)] < Infinity)) return -Infinity;
    const e = lane[lane.length - 1], ex = e % N, ey = (e / N) | 0;
    const end = Math.min(...DIRS.map(([dx, dy]) => (inMap(ex + dx, ey + dy) && S.ground[idx(ex + dx, ey + dy)] !== "~" ? dh[idx(ex + dx, ey + dy)] : Infinity)));
    const gain = (end === Infinity ? 30 : end) - walk - lane.length * R.ferry;
    if (gain < 4) return -Infinity;
    s += gain;
  }
  else if (t === "quarry") { const n = Math.min(3, rocksBeside(x, y)); if (n < 2) return -Infinity; s += n * 3 - Math.max(0, walk - 5); }
  else if (t === "claypit") { const n = Math.min(3, marshBeside(x, y)); if (n < 2) return -Infinity; s += n * 3 - Math.max(0, walk - 5); }
  else if (t === "shepherd") { const n = Math.min(3, Math.floor(grassNear(x, y) / 2)); if (n < 2) return -Infinity; s += n * 3 - Math.max(0, walk - 5); }
  else if (t === "pier") { const n = Math.min(4, sandbarsNear(x, y)); if (n < 2) return -Infinity; s += n * 2 - Math.max(0, walk - 5); }
  else if (t === "lodge") s += S.b.filter(c => isHome(c) && cheb(c, { x, y }) <= 2 && !nearLodge(c.x, c.y)).length * 2 - Math.max(0, walk - 4) * 1.2;
  return s;
}

function botPlace(t) {
  const def = BD[t];
  if (!unlocked(def) || !canAfford(def)) return false;
  const h = botHearth(), dh = costsFrom(h.x, h.y), F = forecast || plan();
  const cands = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (placeProblem(def, x, y)) continue;
    // score the tile as if reached through a neighbour
    const near = Math.min(...DIRS.map(([dx, dy]) => inMap(x + dx, y + dy) ? dh[idx(x + dx, y + dy)] : Infinity));
    const d2 = dh.slice(); d2[idx(x, y)] = near + 0.5;
    const s = botScore(t, x, y, F, d2);
    if (s > -Infinity) cands.push([s, x, y]);
  }
  cands.sort((a, b) => b[0] - a[0]);
  for (const [, x, y] of cands) {
    if (botTry(t, x, y)) { bot.log.push([S.day, t, x, y]); return [x, y]; }
  }
  return false;
}

// rebuild a cottage as a house, where its people already pass a market and meet
// in the evening, so the new beds open at once
function botHouse(F) {
  if (!unlocked(BD.house) || !canAfford(BD.house)) return false;
  let best = null, bs = -Infinity;
  for (const c of S.b) {
    if (c.t !== "cottage" || c.site) continue;
    const res = S.vil.filter(v => v.home === c.id), ws = F.walks.filter(w => res.some(v => v.id === w.v));
    const shops = res.some(v => F.shops[v.id]) || S.b.some(m => m.t === "market" && cheb(m, c) <= 2);
    if (!res.length || !shops || !ws.some(w => w.stop || w.job === botHearth().id)) continue;
    const s = (streetFront(c.x, c.y) ? 2 : 0) + (nearWell(c.x, c.y) ? 2 : 0) + res.length - c.id * 0.001;
    if (s > bs) { bs = s; best = c; }
  }
  if (!best || !build(BD.house, best.x, best.y)) return false;
  bot.log.push([S.day, "house", best.x, best.y]);
  return true;
}

// street furniture: a stall where the most feet pass, a bench on the way home of a
// house whose people don't meet anyone, and late on lamps and flowers for the look
function botStreet(F) {
  const cobs = [];
  for (let i = 0; i < N * N; i++) if (S.cob[i] === "1" && S.deco[i] === "." && !placeProblem(BD.stall, i % N, (i / N) | 0)) cobs.push(i);
  if (!cobs.length) return false;
  const put = (t, i) => { if (!build(BD[t], i % N, (i / N) | 0)) return false; bot.log.push([S.day, t, i % N, (i / N) | 0]); return true; };
  if (unlocked(BD.bench) && canAfford(BD.bench)) {
    const lonely = S.b.filter(h => h.t === "house" && F.needs[h.id] && !F.needs[h.id].company);
    for (const h of lonely) {
      const w = F.walks.find(w => S.vil.some(v => v.id === w.v && v.home === h.id));
      const i = w && w.pm.find(i => cobs.includes(i));
      if (i !== undefined && put("bench", i)) return true;
    }
  }
  if (unlocked(BD.stall) && canAfford(BD.stall) && S.coin > 30 && decoCount("s") < pop() / 12) {
    const i = cobs.filter(i => S.foot[i] >= 9).sort((a, b) => S.foot[b] - S.foot[a])[0];
    if (i !== undefined && put("stall", i)) return true;
  }
  if (S.coin > 250) for (const t of ["lamp", "flowers"]) {
    if (!unlocked(BD[t]) || !canAfford(BD[t]) || decoCount(BD[t].deco) > pop() / 8) continue;
    const i = cobs.sort((a, b) => S.foot[b] - S.foot[a])[t === "lamp" ? 0 : cobs.length - 1];
    if (put(t, i)) return true;
  }
  return false;
}

// plant trees beside a woodcutter that is short of them
function botGrove() {
  if (!unlocked(BD.grove) || S.wood > 150) return false; // plenty of wood: room matters more
  for (const w of S.b.filter(b => b.t === "woodcutter" && treesNear(b.x, b.y) < 8)) {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const x = w.x + i, y = w.y + j;
      if (placeProblem(BD.grove, x, y) || onPath(x, y) || openSides(x, y) < 3) continue;
      if (!canAfford(BD.grove)) return false;
      if (botTry("grove", x, y)) { bot.log.push([S.day, "grove", x, y]); return true; }
    }
  }
  return false;
}

// a bridge that opens up land across the river
function botBridge() {
  if (!unlocked(BD.bridge) || !canAfford(BD.bridge) || count("bridge") > 6) return false;
  const h = botHearth(), dh = costsFrom(h.x, h.y);
  const reach = () => { const d = costsFrom(h.x, h.y); let n = 0; for (let i = 0; i < N * N; i++) if (d[i] < Infinity) n++; return n; };
  const before = reach();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (placeProblem(BD.bridge, x, y)) continue;
    if (!DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && dh[idx(x + dx, y + dy)] < Infinity)) continue;
    const g = S.ground;
    setChar("ground", x, y, "#");
    const gain = reach() - before;
    S.ground = g;
    if (gain >= 4) return botTry("bridge", x, y) && (bot.log.push([S.day, "bridge", x, y]), true);
  }
  return false;
}

// out of room: fell a tree beside the reachable land to make space.  Trees no
// woodcutter uses go first; once wood piles up, any tree will do
function botFell() {
  const h = botHearth(), dh = costsFrom(h.x, h.y), rich = S.wood > 150;
  // the best tree, else the best rock (never one a quarry cuts)
  const best = { tree: null, rock: null }, bs = { tree: -Infinity, rock: -Infinity };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const kind = isTree(x, y) ? "tree" : isRock(x, y) ? "rock" : null;
    if (!kind || !DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && walkable(x + dx, y + dy) && dh[idx(x + dx, y + dy)] < Infinity)) continue;
    if (kind === "rock" && S.b.some(b => b.t === "quarry" && cheb(b, { x, y }) <= 1)) continue;
    const users = kind === "rock" ? 0 : S.b.filter(b => b.t === "woodcutter" && cheb(b, { x, y }) <= R.cutterRadius && treesNear(b.x, b.y) <= 9).length;
    if (users && !rich) continue;
    const s = -users * 10 - (Math.abs(x - h.x) + Math.abs(y - h.y)) * 0.3;
    if (s > bs[kind]) { bs[kind] = s; best[kind] = [x, y]; }
  }
  const at = best.tree || best.rock;
  if (!at || !clearTile(...at)) return false;
  bot.log.push([S.day, best.tree ? "fell" : "rock", ...at]);
  return true;
}

// pull down one workplace the village no longer needs, to free its tile: the one
// with the most unfilled jobs or making least goes first
function botReclaim(F) {
  if (!count("lighthouse") && pop() < 40) return false;
  const surplus = b =>
    (b.t === "tavern" && count("tavern") > 1) ||
    (b.t === "woodcutter" && S.wood > 200 && count("woodcutter") > 2) ||
    (b.t === "fisher" && F.out[b.id] && F.out[b.id].amt === 0 && !F.out[b.id].ashore) ||
    (b.t === "market" && F.out[b.id] && !F.out[b.id].workers.length && count("market") > 1);
  const b = S.b.filter(surplus).sort((a, c) => ((F.out[a.id] || {}).amt || 0) - ((F.out[c.id] || {}).amt || 0))[0];
  if (!b || !clearInfo(b.x, b.y) || !clearTile(b.x, b.y)) return false;
  bot.log.push([S.day, "reclaim " + b.t, b.x, b.y]);
  return true;
}

// the lighthouse, harbour and ship want a shore tile; when the reachable shore is taken, the
// fisher that catches least makes way for it
function botCoast(t, F) {
  if (botPlace(t)) return true;
  if (!canAfford(BD[t])) return false;
  const h = botHearth(), dh = costsFrom(h.x, h.y);
  const f = S.b.filter(b => b.t === "fisher" && !b.site && dh[idx(b.x, b.y)] < Infinity)
    .sort((a, b) => ((F.out[a.id] || {}).amt || 0) - ((F.out[b.id] || {}).amt || 0))[0];
  if (!f || !clearTile(f.x, f.y)) return false;
  if (botTry(t, f.x, f.y)) { bot.log.push([S.day, t, f.x, f.y]); return true; }
  botTry("fisher", f.x, f.y);
  return false;
}

// the island's own trade: stone paves the busiest ground, boardwalks go where
// villagers wade through marsh, causeways out over the sandbars, sea walls in front
// of the fields a storm would flood
function botTrait(F) {
  if (unlocked(BD.causeway) && canAfford(BD.causeway) && (S.stats.causeways || 0) < 14) {
    const h = botHearth(), dh = costsFrom(h.x, h.y);
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (placeProblem(BD.causeway, x, y)) continue;
      if (!DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && ((dh[idx(x + dx, y + dy)] < Infinity && walkable(x + dx, y + dy)) || (ground(x + dx, y + dy) === "_" && S.soil[idx(x + dx, y + dy)] === "W")))) continue;
      if (build(BD.causeway, x, y)) { bot.log.push([S.day, "causeway", x, y]); return true; }
    }
  }
  if (unlocked(BD.seawall) && canAfford(BD.seawall)) {
    const fl = floodTiles();
    for (const f of S.b) {
      if (f.t !== "field" || !fl[idx(f.x, f.y)] || coastal(f.x, f.y)) continue;
      for (const [dx, dy] of DIRS) {
        const x = f.x + dx, y = f.y + dy;
        if (!inMap(x, y) || !fl[idx(x, y)] || placeProblem(BD.seawall, x, y)) continue;
        if (build(BD.seawall, x, y)) { bot.log.push([S.day, "seawall", x, y]); return true; }
      }
    }
  }
  if (unlocked(BD.pave) && S.stone >= 2) {
    let best = -1, bf = 3;
    for (let i = 0; i < N * N; i++) if (S.foot[i] > bf && S.cob[i] !== "1" && !placeProblem(BD.pave, i % N, (i / N) | 0)) { bf = S.foot[i]; best = i; }
    if (best >= 0 && build(BD.pave, best % N, (best / N) | 0)) { bot.log.push([S.day, "pave", best % N, (best / N) | 0]); return true; }
  }
  if (unlocked(BD.boardwalk) && canAfford(BD.boardwalk)) {
    // marsh beside a worn tile or a building: the way villagers would walk if they could
    for (let i = 0; i < N * N; i++) {
      const x = i % N, y = (i / N) | 0;
      if (placeProblem(BD.boardwalk, x, y)) continue;
      if (!DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && (level(idx(x + dx, y + dy)) > 0 || S.soil[idx(x + dx, y + dy)] === "W" || bAt(x + dx, y + dy)))) continue;
      if (build(BD.boardwalk, x, y)) { bot.log.push([S.day, "boardwalk", x, y]); return true; }
    }
  }
  return false;
}

// moments (events.js): a workplace beside a stranger's spot or a wreck, so someone's
// walk finds it (every workplace fills its first job before any takes a second)
function botMoment(F) {
  const E = S.ev && S.ev.cur;
  if (!E || E.at === undefined || (F.event && F.event.id === E.id)) return false;
  const ex = E.at % N, ey = (E.at / N) | 0, h = botHearth(), dh = costsFrom(h.x, h.y);
  for (const t of E.id === "wreck" ? ["pier", "fisher"] : ["woodcutter", "field"]) {
    if (!unlocked(BD[t]) || !canAfford(BD[t])) continue;
    for (const [dx, dy] of RING) {
      const x = ex + dx, y = ey + dy;
      if (!inMap(x, y) || placeProblem(BD[t], x, y) || !DIRS.some(([a, b]) => inMap(x + a, y + b) && dh[idx(x + a, y + b)] < Infinity)) continue;
      if (botTry(t, x, y)) { bot.log.push([S.day, t, x, y]); return true; }
    }
  }
  return false;
}

// lamps along the shortest path-or-better way from the shore to a tavern, so the night
// merchant stops.  Built only when every tile of it can be lit (lamps stand on cobbles)
function botLanterns() {
  if (!unlocked(BD.lamp) || S.coin < 60 || litPath()) return false;
  const taverns = S.b.filter(b => b.t === "tavern" && !b.site);
  if (!taverns.length) return false;
  const ok = i => walkable(i % N, (i / N) | 0) && level(i) >= 2;
  const from = new Int32Array(N * N).fill(-2), q = [];
  for (let i = 0; i < N * N; i++) if (ok(i) && coastal(i % N, (i / N) | 0)) { from[i] = -1; q.push(i); }
  let end = -1;
  for (let k = 0; k < q.length && end < 0; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    if (taverns.some(t => Math.abs(t.x - x) + Math.abs(t.y - y) === 1)) { end = i; break; }
    for (const [dx, dy] of DIRS) { const j = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && ok(j) && from[j] === -2) { from[j] = i; q.push(j); } }
  }
  if (end < 0) return false;
  const line = [];
  for (let j = end; j !== -1; j = from[j]) line.push(j);
  const r = MERCHANT.reach, near = (a, b) => Math.abs((a % N) - (b % N)) <= r && Math.abs(((a / N) | 0) - ((b / N) | 0)) <= r;
  const lamps = [];
  for (let i = 0; i < N * N; i++) if (S.deco[i] === "l") lamps.push(i);
  const plan = [];
  for (let k = 0; k < line.length; k++) {
    if ([...lamps, ...plan].some(l => near(l, line[k]))) continue;
    // a cobbled tile lighting this one, as far along the way as can be
    let best = -1;
    for (let j = Math.min(line.length - 1, k + r); j >= Math.max(0, k - r) && best < 0; j--) {
      const t = line[j];
      if (S.cob[t] === "1" && S.deco[t] === "." && near(t, line[k]) && !placeProblem(BD.lamp, t % N, (t / N) | 0)) best = t;
    }
    if (best < 0) return false;
    plan.push(best);
  }
  let cost = 0;
  for (let k = 0; k < plan.length; k++) cost += BD.lamp.cost.coin + Math.floor(((decoCount("l") + k) * BD.lamp.cost.coin) / R.costStep);
  if (!plan.length || S.coin < cost + 40) return false;
  for (const i of plan) if (build(BD.lamp, i % N, (i / N) | 0)) bot.log.push([S.day, "lamp", i % N, (i / N) | 0]);
  return true;
}

// the merchant's stall, while it stands: lots of wood for the ship and of food for the
// winter, goods the houses lack; a boon or an heirloom once the coins run high
function botShop(F) {
  if (!S.shop || S.shop.day !== S.day) return;
  const shipLeft = unlocked(BD.ship) && !count("ship"), reserve = 60 + (shipLeft ? costOf(BD.ship).coin : 0);
  const buy = id => (S.coin - S.shop.wares.find(w => w.id === id).price >= reserve) && buyWare(id) && (bot.log.push([S.day, "buy " + id, 0, 0]), true);
  const has = id => S.shop.wares.some(w => w.id === id && w.left > 0);
  const larder = winterLarder(F, pop());
  while (has("wood") && S.wood < (shipLeft ? costOf(BD.ship).wood + 20 : 60) && buy("wood"));
  while (has("food") && (S.food < larder || F.make.food < pop()) && S.food < 40 + larder && buy("food"));
  while (has("goods") && F.use.goods > F.make.goods && S.goods < 40 && buy("goods"));
  for (const w of S.shop.wares) if ((w.id.startsWith("b:") || w.id.startsWith("h:")) && w.left > 0 && S.coin >= w.price * 2 + reserve) buy(w.id);
}

// the Twin isles: a line of long bridges straight across the strait, from reachable
// land to land that isn't yet, when all of it can be paid for
function botLongBridge() {
  if (!unlocked(BD.longbridge) || (S.stats.longbridges || 0) > 16) return false;
  const h = botHearth(), dh = costsFrom(h.x, h.y);
  let best = null;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (dh[i] === Infinity || !walkable(x, y)) continue;
    for (const [dx, dy] of DIRS) {
      const line = [];
      let k = 1, end = -1;
      for (; k <= 5; k++) {
        const nx = x + dx * k, ny = y + dy * k, j = idx(nx, ny);
        if (!inMap(nx, ny)) break;
        if (S.ground[j] === "~" && S.soil[j] === "c") { line.push(j); continue; }
        if (S.ground[j] === "#" && S.soil[j] === "c") continue;
        if (S.ground[j] === "." && S.feat[j] === "." && !bAt(nx, ny)) end = j;
        break;
      }
      if (end < 0 || !line.length || dh[end] < Infinity) continue;
      if (!best || line.length < best.length) best = line;
    }
  }
  if (!best) return false;
  const c = costOf(BD.longbridge);
  if (S.wood < c.wood * best.length + 4 || S.coin < c.coin * best.length) return false;
  for (const j of best) if (build(BD.longbridge, j % N, (j / N) | 0)) bot.log.push([S.day, "longbridge", j % N, (j / N) | 0]);
  return true;
}

// land won from the sea (once the town hall stands): where the village is short of
// room, the sea tile beside the reachable shore nearest the hearth; never in front of
// a building that needs the water
function botLandReclaim() {
  if (!unlocked(BD.reclaim) || !canAfford(BD.reclaim)) return false;
  const h = botHearth(), dh = costsFrom(h.x, h.y);
  let best = -1, bs = Infinity;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (placeProblem(BD.reclaim, x, y)) continue;
    const near = Math.min(...DIRS.map(([dx, dy]) => (inMap(x + dx, y + dy) ? dh[idx(x + dx, y + dy)] : Infinity)));
    if (near === Infinity) continue;
    const s = near + Math.abs(x - h.x) * 0.01;
    if (s < bs) { bs = s; best = i; }
  }
  if (best < 0 || !build(BD.reclaim, best % N, (best / N) | 0)) return false;
  bot.log.push([S.day, "reclaim", best % N, (best / N) | 0]);
  return true;
}

// open jobs in finished workplaces
const botSlots = () => S.b.reduce((a, b) => a + (BD[b.t].jobs && !b.site ? BD[b.t].jobs : 0), 0);

function botTurn() {
  const built = [];
  if (R.events) { refreshForecastQuiet(); botShop(forecast); }
  for (let k = 0; k < 12; k++) {
    refreshForecastQuiet();
    const F = forecast, p = pop(), beds = totalBeds(), X = wx();
    const idle = F.idle, sites = S.b.filter(b => b.site).length, lit = count("lighthouse") > 0;
    // hands kept free for the building sites, so projects get done
    const spare = idle - (sites ? 2 : 0);
    const foodNeed = p + 3 * (1 + (F.cheer ? 1 : 0) + (lit ? 1 : 0) + (F.word ? 1 : 0)) + 1;
    // fields rest in winter: then only fishers and lodges feed the village
    const food = (X.winter ? ["fisher", "lodge"] : unlocked(BD.fisher) ? ["fisher", "field", "lodge"] : ["field"]).filter(t => unlocked(BD[t]));
    // before winter, fill the larder; while it is short, no more beds
    const larder = winterLarder(F, p), short = S.food < larder;
    bot.flood = X.rules ? floodTiles() : null;
    const houseGoods = S.b.filter(b => b.t === "house").reduce((a, b) => a + residents(b.id) * R.goods.perResident, 0);
    // the tiles walked by villagers who pass no market, for placing the next one
    bot.unserved = new Map();
    for (const w of F.walks) if (!F.shops[w.v]) for (const i of w.am) bot.unserved.set(i, (bot.unserved.get(i) || 0) + 1);
    const unserved = S.b.some(h => h.t === "house" && F.needs[h.id] && !F.needs[h.id].market);
    const wants = [];
    // what the village needs, most urgent first; the first that finds a spot is built
    if (!count("woodcutter")) wants.push("woodcutter");
    // the Atoll: a first ferry opens the land across the lagoon, before anything else
    if (unlocked(BD.ferry) && !count("ferry") && pop() >= 6) wants.push("ferry");
    if (F.make.food < p + 1 && (spare > 0 || botSlots() <= p)) wants.push(...food);
    if (F.make.wood < 3 + p / 6 && S.wood < 120 && spare > 0) wants.push("woodcutter");
    const rebuilding = S.b.filter(b => b.to).length;
    if (short) wants.push(...food);
    if (beds - p < 2 + (lit ? 1 : 0) && (!short || beds < p)) wants.push(...(rebuilding < 2 ? ["house"] : []), "cottage");
    // a new workplace's first job comes before anyone's second, so food is worth
    // building even when nobody is free
    if (F.make.food < foodNeed && (spare > 0 || S.food < 10)) wants.push(...food);
    // goods only once houses can use them
    if (unlocked(BD.house) && !S.b.some(b => b.t === "workshop" && b.site) && spare > 1 &&
      (count("workshop") === 0 || F.make.goods < houseGoods + 6) && S.wood > 12) wants.push("workshop");
    if (unlocked(BD.market) && spare > 0) {
      // markets by what their keepers can serve, and one per 30 villagers at least
      const busy = S.b.filter(b => b.t === "market").every(m => F.out[m.id] && F.out[m.id].base > 8 * BD.market.jobs);
      if (count("market") < 1 + Math.floor(p / 30) || busy || unserved) wants.push("market");
    }
    if (unlocked(BD.well)) wants.push("well");
    // taverns by demand: more guests than the keepers can serve
    const crowded = S.b.filter(b => b.t === "tavern").every(t => F.out[t.id] && F.out[t.id].base > BD.tavern.serve * BD.tavern.jobs + 5);
    if (unlocked(BD.tavern) && (count("tavern") < 1 + (bot.dense ? 0 : Math.floor(p / 25)) || crowded)) wants.push("tavern");
    if (unlocked(BD.lighthouse) && !lit) wants.push("lighthouse");
    // the voyage: tribute needs a harbour; the goal met, the ship
    if (unlocked(BD.harbour) && !count("harbour") && S.day > 6) wants.push("harbour");
    if (unlocked(BD.ship) && !count("ship")) wants.unshift("ship");
    if (unlocked(BD.quarry) && count("quarry") < 1 + Math.floor(p / 30) && spare > 0) wants.push("quarry");
    if (unlocked(BD.claypit) && count("claypit") < 1 + Math.floor(p / 30) && spare > 0) wants.push("claypit");
    if (unlocked(BD.shepherd) && count("shepherd") < 1 + Math.floor(p / 25) && spare > 0) wants.push("shepherd");
    if (unlocked(BD.pier) && count("pier") < 1 + Math.floor(p / 40) && spare > 0) wants.push("pier");
    if (unlocked(BD.ferry) && count("ferry") < 2 && (spare > 0 || !count("ferry"))) wants.push("ferry");
    // the late game: the town hall once the coins allow it (the ship comes first), then
    // grand markets where the markets are busy
    const shipDue = unlocked(BD.ship) && !count("ship");
    // (before the goal, only with the ship's coins to spare as well)
    // (it comes early in the list: a full island has no room left for it)
    if (unlocked(BD.townhall) && !count("townhall") && !shipDue && p >= 30 && S.coin >= costOf(BD.townhall).coin + 60 + (S.goalMet || lastChapter() ? 0 : costOf(BD.ship).coin)) wants.splice(1, 0, "townhall");
    if (unlocked(BD.grandmarket) && spare > 0 && S.coin >= costOf(BD.grandmarket).coin + 100 && count("grandmarket") < 1 + Math.floor(p / 70)) wants.push("grandmarket");
    // goods to spare for another house's people: rebuild another cottage, beds short or not
    if (unlocked(BD.house) && rebuilding < 2 && F.make.goods - F.use.goods >= 5) wants.push("house");
    // saving up for the ship: nothing else, unless food runs short (in winter, the
    // larder counts); a woodcutter if the wood for it comes in too slowly
    if (unlocked(BD.ship) && !count("ship") && !canAfford(BD.ship) && S.food >= 10 && (F.make.food >= p || S.food >= 5 * p)) {
      if (S.wood < costOf(BD.ship).wood && F.make.wood - F.use.wood < 3 && botPlace("woodcutter")) { built.push("woodcutter"); continue; }
      break;
    }
    const t = [...new Set(wants)].find(w => (w === "house" ? botHouse(F) : w === "lighthouse" || w === "ship" || w === "harbour" ? botCoast(w, F) : botPlace(w)));
    if (t) { built.push(t); continue; }
    if (R.events && botMoment(F)) { built.push("moment"); continue; }
    if (R.events && botLanterns()) { built.push("lanterns"); continue; }
    if (botStreet(F)) { built.push("street"); continue; }
    if (botTrait(F)) { built.push("trait"); continue; }
    if (botBridge()) { built.push("bridge"); continue; }
    if (botLongBridge()) { built.push("longbridge"); continue; }
    if (botGrove()) { built.push("grove"); continue; }
    // stuck on room for homes or food: clear a tree, or pull down what isn't needed
    const stuck = ["cottage", "field", "workshop", "market", "townhall"].some(t => wants.includes(t) && canAfford(BD[t]));
    // rich enough: win land from the sea (the town hall's coin sink)
    if ((stuck || S.coin > 4 * costOf(BD.reclaim).coin + 300) && botLandReclaim()) { built.push("land"); continue; }
    if (stuck && botFell()) { built.push("fell"); continue; }
    if (stuck && bot.dense && botReclaim(F)) { built.push("reclaim"); continue; }
    break;
  }
  refreshForecastQuiet();
  return built;
}
// how much food to have in store for the coming winter (Seasonal and Wild): what the
// village eats beyond its fishers' and hunters' catch, for every winter day left, less
// what the days before it will still bring in
function winterLarder(F, p) {
  const X = wx();
  if (X.rules === false || R.weather === "calm") return 0;
  const L = S.traits.includes("snow") ? SEASON_LEN.snow : SEASON_LEN.usual, c = calendar(S.day, S.traits);
  const inWinter = c.season === 3, toWinter = inWinter ? 0 : L.slice(c.season, 3).reduce((a, b) => a + b, 0) - c.sday;
  if (toWinter > 12) return 0;
  const days = inWinter ? c.len - c.sday : L[3];
  const catchDay = S.b.filter(b => b.t === "fisher" || b.t === "lodge").reduce((a, b) => a + ((F.out[b.id] || {}).amt || 0), 0);
  return Math.max(0, (p + 2 - catchDay) * days - (inWinter ? 0 : Math.max(0, F.make.food - p) * toWinter));
}

// is there any tile at all for this building?
function botSpot(t) {
  const h = botHearth(), dh = costsFrom(h.x, h.y);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!placeProblem(BD[t], x, y) && botScore(t, x, y, null, dh) > -Infinity) return true;
  return false;
}
// the forecast without touching the UI, so this also runs headless
function refreshForecastQuiet() { forecast = plan(); }
