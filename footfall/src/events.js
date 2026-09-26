/* Moments: the event deck, the night merchant and the festival scar (the plan's §8).
 *
 * The deck is seeded per island and drawn each morning, like the weather: one event
 * at a time, at least EVENT.gap days apart, none in chapter 1 before its first
 * milestone.  An event is data in the style of the tutorial's LESSONS: `when` (its
 * moment has come), `setup` (it marks the map, in the morning, so the forecast already
 * knows it) and `reached` (checked inside plan(), so the forecast says whether today's
 * walking finds it).  The night applies what it did (eventNight).  Nothing is stored
 * in advance: S.ev keeps the event under way and what the deck has done.
 *
 * The night merchant keeps a timetable of its own (merchantDue, like the tribute
 * boats) once lamps are known, and stops only where a lit path leads from the shore to
 * a tavern: then its stall stands by the tavern for a day (S.shop).  A festival makes
 * the next day a feast: everyone walks to the hearth after work, and the paths of that
 * one day stay as a scar of pale flagstones (S.scar).
 */
"use strict";

// what the last night brought, for the day's playback and the tutorial (day.js)
const moments = { started: null, reached: null, ended: null, joined: [], found: [], merchant: null, feast: false, letters: [] };

const EVENTS = [
  // a line of trail from the coast into the woods, to a hermit's hut, a shrine or a
  // castaways' camp; found when any villager's walk passes within a tile of it
  { id: "stranger", name: "A stranger's footprints", weight: 3, days: STRANGER.days,
    when: () => true, setup: strangerSetup, reached: (E, P) => walksNear(P, E.at, EVENT.reach) },
  // once a season a herd crosses the island; planted trees turn it
  { id: "herd", name: "Migrating animals", weight: 4, days: HERD.days,
    when: () => herdSeason() !== S.ev.herd, setup: herdSetup },
  // the Tidal isle: a wreck on a sandbar at a spring tide, driftwood and a castaway
  { id: "wreck", name: "A wreck on the sandbar", weight: 8, days: WRECK.days,
    when: () => S.traits.includes("tidal") && wx().tide, setup: wreckSetup, reached: (E, P) => walksNear(P, E.at, EVENT.reach) },
  // pirates bury a chest: a ring on the map closes in on it; a walk over the very tile
  // (or a building put on it) digs it up
  { id: "treasure", name: "The pirates' treasure", weight: 2, days: TREASURE.days,
    when: () => S.chapter > 1 || S.ms >= 4, setup: treasureSetup, reached: (E, P) => byTile.has(E.at) || walksOver(P, E.at) },
];
const eventDef = id => EVENTS.find(e => e.id === id);
const STRANGER_KIND = { hermit: "H", shrine: "S", boat: "B" };

// ------------------------------------------------------------------ the deck

// each morning (the end of applyNight): an event that ran its course ends quietly,
// and with none under way the deck may draw the next.  P: the night's plan (its walks)
function eventsMorning(P) {
  const ev = S.ev;
  if (!R.events || !ev) return;
  if (ev.cur && S.day > ev.cur.until) endEvent("gone");
  if (ev.cur || S.day < ev.next || (S.chapter === 1 && S.ms < 1)) return;
  if (roll(S.seed, S.day, 0xe7e1) >= EVENT.p) return;
  const ok = EVENTS.filter(e => e.when());
  let k = roll(S.seed, S.day, 0xe7e2) * ok.reduce((a, e) => a + e.weight, 0);
  const e = ok.find(o => (k -= o.weight) < 0);
  const E = e && e.setup(P);
  if (!E) return; // no room for it today: the deck tries again tomorrow
  ev.cur = { id: e.id, day: S.day, until: S.day + e.days - 1, ...E };
  ev.next = S.day + EVENT.gap;
  moments.started = ev.cur;
  chron("event", { stranger: "A stranger's *footprints* lead up from the shore.", herd: "A *herd* of deer comes ashore.", wreck: "A *wreck* lies on the sandbar.",
    treasure: "A *pirate ship* anchors offshore: they bury something, and sail away." }[e.id] || e.name);
}

// the event under way is over: found, or gone (a stranger moves on, the tide takes the
// wreck).  What it left stays, except a wreck, which is salvaged or washed away
function endEvent(how) {
  const E = S.ev.cur;
  if (E.at !== undefined && (E.id === "wreck" || how === "gone") && PROPS[S.feat[E.at]]) setChar("feat", E.at % N, (E.at / N) | 0, ".");
  S.ev.log.push([E.id, E.day, how]);
  if (S.ev.log.length > 30) S.ev.log.shift();
  S.ev.cur = null;
  moments.ended = { id: E.id, how, kind: E.kind };
  if (how === "gone" && E.id !== "herd") chron("event", { stranger: "The stranger's trail went cold.", wreck: "The tide took the wreck.", treasure: "The pirates came back and dug up their gold." }[E.id] || "It passed.");
}

// does any villager's walk today go over tile i itself?
function walksOver(P, i) {
  for (const w of P.walks) for (const t of [w.am, w.pm]) if (t.includes(i)) return true;
  return false;
}
// does any villager's walk today pass within r tiles of tile i?
function walksNear(P, i, r) {
  const x = i % N, y = (i / N) | 0;
  for (const w of P.walks) for (const t of [w.am, w.pm]) for (const j of t) if (Math.abs((j % N) - x) <= r && Math.abs(((j / N) | 0) - y) <= r) return true;
  return false;
}

// ------------------------------------------------------------------ a stranger's footprints

// a spot by the woods (the more trees round it the better), well away from the village
// and off today's walks, walling nothing in; it may lie across a river, for a bridge.  A line of trail runs
// to it from the nearest shore.  What waits there is seeded: a hermit, a shrine, castaways
function strangerSetup(P) {
  const h = hearthB, d = costsFrom(h.x, h.y), cands = [];
  // the open land each tile is part of: the spot needs a way up to it
  const part = new Int32Array(N * N).fill(-1), size = [];
  groups(i => walkable(i % N, (i / N) | 0)).forEach((g, k) => { for (const i of g) part[i] = k; size.push(g.length); });
  const approach = (x, y) => DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && part[idx(x + dx, y + dy)] >= 0 && size[part[idx(x + dx, y + dy)]] >= 20);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0, far = Math.max(Math.abs(x - h.x), Math.abs(y - h.y));
    if (far < STRANGER.near || !walkable(x, y) || S.ground[i] !== "." || "wWL".includes(S.soil[i]) || S.deco[i] !== ".") continue;
    let trees = 0, feet = 0;
    for (const [dx, dy] of [[0, 0], ...RING]) {
      if (!inMap(x + dx, y + dy)) continue;
      if (isTree(x + dx, y + dy)) trees++;
      feet += P ? P.foot[idx(x + dx, y + dy)] : 0;
    }
    if (feet || !approach(x, y) || chokepoint(x, y)) continue;
    cands.push([trees * 2 + Math.min(4, far / 2) + (d[i] < Infinity ? 2 : 0), i]);
  }
  cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const pick = Math.floor(roll(S.seed, S.day, 0x57a1) * 6);
  let at = -1, trail = [];
  for (let k = 0; k < cands.length && at < 0; k++) {
    const c = cands[(pick + k) % cands.length][1], t = trailFromShore(c);
    if (t.length >= 3) { at = c; trail = t; }
  }
  if (at < 0) return null;
  // (no castaways on the first island: its festival stays on day 27 or later)
  const r = roll(S.seed, S.day, 0x57a2) * (S.chapter > 1 ? 1 : 0.7), kind = r < 0.4 ? "hermit" : r < 0.7 ? "shrine" : "boat";
  for (const i of trail) S.wear[i] = Math.max(S.wear[i], R.wear.path - 1);
  setChar("feat", at % N, (at / N) | 0, STRANGER_KIND[kind]);
  return { at, kind, trail };
}

// would blocking this tile cut its open neighbours off from each other?  (a quick
// local test: they must still meet within a few tiles)
function chokepoint(x, y) {
  const open = DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => walkable(a, b));
  if (open.length < 2) return false;
  const seen = new Set([idx(...open[0])]), q = [open[0]];
  for (let k = 0; k < q.length; k++) {
    const [a, b] = q[k];
    for (const [dx, dy] of DIRS) {
      const nx = a + dx, ny = b + dy, j = idx(nx, ny);
      if ((nx === x && ny === y) || Math.abs(nx - x) > 3 || Math.abs(ny - y) > 3 || seen.has(j) || !walkable(nx, ny)) continue;
      seen.add(j); q.push([nx, ny]);
    }
  }
  return open.some(([a, b]) => !seen.has(idx(a, b)));
}

// the stranger's way in: from the nearest open shore to the spot, over open ground
function trailFromShore(at) {
  const from = new Int32Array(N * N).fill(-2), q = [at];
  from[at] = -1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    if (k && coastal(x, y)) {
      const out = [];
      for (let j = i; j !== at; j = from[j]) out.push(j);
      return out;
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, j = idx(nx, ny);
      if (inMap(nx, ny) && from[j] === -2 && walkable(nx, ny) && S.ground[j] === ".") { from[j] = i; q.push(j); }
    }
  }
  return [];
}

// ------------------------------------------------------------------ migrating animals

// which season of which year it is: one herd each
const herdSeason = () => Math.floor((S.day - 1) / 40) * 4 + calendar(S.day, S.traits).season;

// in at one shore, out at the one facing it across the island (seeded), over the
// stretch of open land (between the rivers) where that crossing is longest
function herdSetup() {
  const a = roll(S.seed, S.day, 0x4e7d) * Math.PI * 2, c = (N - 1) / 2, ux = Math.cos(a), uy = Math.sin(a);
  const along = i => ((i % N) - c) * ux + (((i / N) | 0) - c) * uy;
  let from = -1, to = -1;
  for (const part of groups(i => walkable(i % N, (i / N) | 0))) {
    const shore = part.filter(i => coastal(i % N, (i / N) | 0));
    if (!shore.length) continue;
    const lo = shore.reduce((m, i) => (along(i) < along(m) ? i : m)), hi = shore.reduce((m, i) => (along(i) > along(m) ? i : m));
    if (from < 0 || along(hi) - along(lo) > along(to) - along(from)) { from = lo; to = hi; }
  }
  if (from < 0 || Math.abs((to % N) - (from % N)) + Math.abs(((to / N) | 0) - ((from / N) | 0)) < N / 3) return null;
  S.ev.herd = herdSeason();
  return { from, to, n: HERD.n };
}

// the herd's way across: shy of streets and houses, around trees and buildings.
// No way through (trees planted across it): the herd turns back
function herdRoute(a, b) {
  if (!walkable(a % N, (a / N) | 0) || !walkable(b % N, (b / N) | 0)) return null;
  const near = new Uint8Array(N * N);
  for (const o of S.b) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inMap(o.x + i, o.y + j)) near[idx(o.x + i, o.y + j)] = 1;
  const g = new Float64Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), bx = b % N, by = (b / N) | 0;
  g[a] = 0;
  heapReset();
  heapPush(0, a);
  while (HEAP.n) {
    const i = heapPop();
    if (i === b) break;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, j = idx(nx, ny);
      if (!inMap(nx, ny) || !walkable(nx, ny)) continue;
      const c = g[i] + [1, 1, 1.3, 2][level(j)] + (near[j] ? 1.5 : 0);
      if (c < g[j]) { g[j] = c; from[j] = i; heapPush(c + Math.abs(nx - bx) + Math.abs(ny - by), j); }
    }
  }
  if (from[b] < 0) return null;
  const path = [b];
  while (path[path.length - 1] !== a) path.push(from[path[path.length - 1]]);
  return path.reverse();
}

// ------------------------------------------------------------------ a wreck on the sandbar

function wreckSetup() {
  const bars = [];
  for (let i = 0; i < N * N; i++) if (S.ground[i] === "_" && S.soil[i] !== "W" && S.feat[i] === ".") bars.push(i);
  if (!bars.length) return null;
  const at = bars[Math.floor(roll(S.seed, S.day, 0x3ec4) * bars.length)];
  setChar("feat", at % N, (at / N) | 0, "X");
  return { at };
}

// ------------------------------------------------------------------ the pirates' treasure

// a chest under open grass, off the paths and off today's walks, away from the village;
// the pirate ship anchors off the nearest open shore
function treasureSetup(P) {
  const h = hearthB, cands = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    if (Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) < 4 || !walkable(x, y) || S.ground[i] !== "." || byTile.has(i)) continue;
    if ("wWLf".includes(S.soil[i]) || level(i) > 0 || (P && P.foot[i]) || S.deco[i] !== "." || onSquare(x, y)) continue;
    cands.push(i);
  }
  if (!cands.length) return null;
  const at = cands[hashInt(S.seed, S.day, 0x7ea5) % cands.length];
  // where the map's ring sits while it is wide (the chest is inside it)
  const off = k => (hashInt(S.seed, S.day, k) % 3) - 1;
  let ship = -1, bd = Infinity;
  for (let i = 0; i < N * N; i++) {
    if (S.ground[i] !== "~" || S.soil[i] !== "." || !DIRS.every(([dx, dy]) => { const x = (i % N) + dx, y = ((i / N) | 0) + dy; return !inMap(x, y) || ground(x, y) === "~"; })) continue;
    const d = Math.abs((i % N) - (at % N)) + Math.abs(((i / N) | 0) - ((at / N) | 0));
    if (d < bd) { bd = d; ship = i; }
  }
  return { at, ox: off(0x7ea6), oy: off(0x7ea7), ship };
}
// the ring on the torn map today: its middle and radius (2, then 1, then the very tile)
function treasureRing(E, day = S.day) {
  const r = Math.max(0, 2 - Math.floor((day - E.day) / TREASURE.shrink));
  const x = (E.at % N) + (r ? E.ox : 0), y = ((E.at / N) | 0) + (r ? E.oy : 0);
  return { x, y, r };
}

// ------------------------------------------------------------------ the night merchant

// its sail comes by every few days once lamps are known (never in a storm)
const merchantPhase = () => hashInt(S.seed, 0x3e7c) % MERCHANT.every;
const merchantDue = (day = S.day) => !!R.events && !!S.ev && unlocked(BD.lamp) && (day + merchantPhase()) % MERCHANT.every === 0 && !weatherOf(day).storm;

// a lit path from the shore to a tavern: path or cobbles, every tile within reach of a
// lamp, joined side by side.  Returns its tiles (shore first), or null
function litPath() {
  const taverns = S.b.filter(b => b.t === "tavern" && !b.site);
  if (!taverns.length || !S.deco.includes("l")) return null;
  const lit = new Uint8Array(N * N), r = MERCHANT.reach;
  for (let l = 0; l < N * N; l++) {
    if (S.deco[l] !== "l") continue;
    const lx = l % N, ly = (l / N) | 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const x = lx + i, y = ly + j;
      if (inMap(x, y) && walkable(x, y) && level(idx(x, y)) >= 2) lit[idx(x, y)] = 1;
    }
  }
  const from = new Int32Array(N * N).fill(-2), q = [];
  for (let i = 0; i < N * N; i++) if (lit[i] && coastal(i % N, (i / N) | 0)) { from[i] = -1; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    if (taverns.some(t => Math.abs(t.x - x) + Math.abs(t.y - y) === 1)) {
      const out = [];
      for (let j = i; j !== -1; j = from[j]) out.push(j);
      return out.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const j = idx(x + dx, y + dy);
      if (inMap(x + dx, y + dy) && lit[j] && from[j] === -2) { from[j] = i; q.push(j); }
    }
  }
  return null;
}

// what the merchant brings, fixed when its stall opens: lots of food, wood and goods,
// and one each of an heirloom, a boon and a cosmetic you don't have, and a free boon
// reroll for the next departure.  Prices climb with the chapter
function shopWares() {
  const ch = S.chapter, r = rng(hashInt(S.seed, S.day, 0x5b0f)), pickOne = a => a.length ? a[Math.floor(r() * a.length)] : null;
  const out = [];
  for (const res in MERCHANT.lots) {
    if (res === "goods" && !unlocked(BD.house)) continue;
    const L = MERCHANT.lots[res];
    out.push({ id: res, res, n: L.n, price: L.price, left: 2 + ch });
  }
  if (W) {
    const h = pickOne(HEIRLOOMS.filter(o => !W.voyage.heirlooms.includes(o.id)));
    if (h) out.push({ id: "h:" + h.id, price: MERCHANT.heirloom * ch, left: 1 });
    const b = pickOne(BOONS.filter(o => !W.voyage.boons.includes(o.id)));
    if (b) out.push({ id: "b:" + b.id, price: MERCHANT.boon * ch, left: 1 });
    if (!lastChapter()) out.push({ id: "reroll", price: MERCHANT.reroll * ch, left: 1 });
  }
  if (typeof PROFILE !== "undefined") {
    const c = pickOne(Object.keys(COSMETICS).filter(k => !PROFILE.cosmetics.includes(k)));
    if (c) out.push({ id: "c:" + c, price: MERCHANT.cosmetic, left: 1 });
  }
  return out;
}
// a ware's name and what it does
function wareInfo(w) {
  const [k, id] = w.id.includes(":") ? w.id.split(":") : [w.id, null];
  if (w.res) return { name: `${w.n} ${w.res}`, desc: `A lot of ${w.res} from the merchant's hold.` };
  if (k === "h") { const h = HEIRLOOMS.find(o => o.id === id); return { name: h.name, desc: "An heirloom: " + h.desc }; }
  if (k === "b") { const b = BOONS.find(o => o.id === id); return { name: b.name, desc: "A boon for the voyage: " + b.desc }; }
  if (k === "c") { const c = COSMETICS[id]; return { name: c.name, desc: c.kind === "hat" ? "A hat some villagers will wear, on every island." : "A cobble pattern to pave an island with (the codex, SECRETS)." }; }
  return { name: "Chart reroll", desc: "At the next departure, one *free* reroll of the boons." };
}
// buy one of a ware: coins go, the thing comes.  false if it can't be had
function buyWare(id) {
  const w = S.shop && S.shop.day === S.day && S.shop.wares.find(o => o.id === id);
  if (!w || w.left <= 0 || S.coin < w.price) return false;
  S.coin -= w.price; w.left--;
  S.stats.merchant = (S.stats.merchant || 0) + w.price;
  const [k, x] = id.includes(":") ? id.split(":") : [id, null];
  if (w.res) S[w.res] += w.n;
  else if (k === "h") { W.voyage.heirlooms.push(x); R = makeRules(W.settings, W.voyage); }
  else if (k === "b") { W.voyage.boons.push(x); R = makeRules(W.settings, W.voyage); }
  else if (k === "c") gainCosmetic(x);
  else if (k === "reroll") W.voyage.tokens = (W.voyage.tokens || 0) + 1;
  return true;
}
const gainCosmetic = id => { if (typeof PROFILE !== "undefined" && !PROFILE.cosmetics.includes(id)) { PROFILE.cosmetics.push(id); saveProfile(); } };

// ------------------------------------------------------------------ inside plan()

// today's moments, worked out with the day's walks: the event under way (found by
// someone's walk? the herd's crossing), the merchant's sail, the feast
function eventPlan(P) {
  if (!R.events || !S.ev) return;
  const E = S.ev.cur;
  if (E && E.id === "herd" && S.day <= E.until) {
    const r = herdRoute(E.from, E.to);
    if (r) {
      P.graze = P.graze || new Array(N * N).fill(0);
      for (let k = 0; k < r.length; k++) P.graze[r[k]] += E.n;
      P.herds.push({ route: r, n: E.n });
    } else P.herds.push({ turned: true, from: E.from, n: E.n });
  } else if (E && eventDef(E.id).reached && eventDef(E.id).reached(E, P)) {
    const o = P.event = { id: E.id, kind: E.kind || null, at: E.at, gift: {}, join: 0, boon: null };
    if (E.id === "wreck") { o.gift.wood = WRECK.wood + WRECK.perChapter * S.chapter; o.join = 1; }
    if (E.id === "treasure") { o.gift.coin = TREASURE.coin + TREASURE.perChapter * S.chapter; o.hat = typeof PROFILE !== "undefined" && !PROFILE.cosmetics.includes("tricorn"); }
    if (E.kind === "boat") o.join = STRANGER.crew;
    if (E.kind === "hermit") {
      const left = W ? BOONS.filter(b => !W.voyage.boons.includes(b.id)) : [];
      if (left.length) o.boon = left[hashInt(S.seed, E.day, 0x4e57) % left.length].id;
      else o.gift.coin = 50 * S.chapter;
    }
  }
  if (merchantDue()) { const path = litPath(); P.merchant = { lit: !!path, path }; }
}

// ------------------------------------------------------------------ at night

// what the day's moments did, applied with the night (applyNight): an event found and
// its reward, the merchant's stall, the feast's scar
function eventNight(P) {
  Object.assign(moments, { started: null, reached: null, ended: null, joined: [], found: [], merchant: P.merchant, feast: !!P.feast, letters: [] });
  if (!S.ev) return;
  const o = P.event;
  if (o) {
    for (const r in o.gift) S[r] += o.gift[r];
    if (o.boon) { W.voyage.boons.push(o.boon); R = makeRules(W.settings, W.voyage); }
    if (o.kind === "shrine") foundSecret("shrine", [o.at]);
    if (o.hat) gainCosmetic("tricorn");
    chron("event", { hermit: o.boon ? "The *hermit* gives the voyage a boon." : "The *hermit* gives a purse of coins.", shrine: "An old *shrine* is found in the woods.",
      boat: `*${o.join} castaways* join the village.`, wreck: `The *wreck* is salvaged: ${o.gift.wood} wood and a castaway.`, treasure: `*Treasure!* The pirates' chest: ${o.gift.coin} coins.` }[o.kind || o.id] || "Found.");
    for (let k = 0; k < o.join; k++) moments.joined.push(addVillager(S, 0)); // homeless until a bed is free
    S.stats.castaways = (S.stats.castaways || 0) + o.join;
    moments.reached = o;
    endEvent("found");
  }
  // the stall is open for the day after the merchant stops
  S.shop = null;
  if (P.feast) {
    const scar = new Set(S.scar || []);
    for (let i = 0; i < N * N; i++) if (P.foot[i] >= FEAST.min && S.ground[i] === "." && !byTile.has(i) && !onSquare(i % N, (i / N) | 0)) scar.add(i);
    S.scar = [...scar].sort((a, b) => a - b);
  }
}
// ...and once the new day has begun
function eventDawn(P) {
  if (P.merchant && P.merchant.lit) { S.shop = { day: S.day, wares: shopWares() }; S.stats.merchants = (S.stats.merchants || 0) + 1; chron("event", "The *night merchant* stops by the tavern."); }
  if (P.feast) chron("festival", "*The feast*: everyone walks to the hearth.");
  eventsMorning(P);
}

// the feast: the day after a festival (checkMilestones sets S.feast)
const feastToday = () => !!R.events && S.feast === S.day;
