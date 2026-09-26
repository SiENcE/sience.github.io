/* Voyages: the world of islands and sailing on (the plan's §5).
 *
 * A world is W: its settings, the sea chart (nodes are islands, edges the routes
 * sailed), the voyage (chapter, boons, heirlooms, charters met) and the islands
 * left behind.  When an island's goal is met the ship can be built; sailing
 * freezes the island (it is never simulated again), works out its tribute, and
 * lands a crew on the island picked from two on the chart, each bringing a trait
 * not yet played.  Everything here is seeded by the world, so a world code makes
 * the same voyage anywhere.  The screens for it are in chart.js.
 */
"use strict";

// ------------------------------------------------------------------ world

function makeWorld(settings, name) {
  const s = { ...defaultSettings(), seed: newSeed(), ...settings }, t = Date.now();
  const home = { id: 0, x: 0, y: 0, chapter: 1, traits: ["meadow"], size: s.size, seed: s.seed, name: islandName(s.seed), status: "active" };
  return {
    format: "footfall-world", version: SAVE_VERSION, game: GAME_VERSION,
    id: typeof newWorldId === "function" ? newWorldId() : "local", name: name || worldName(s.seed), created: t, updated: t, settings: s,
    chart: { nodes: [home], edges: [] },
    voyage: { chapter: 1, boons: [], heirlooms: [], charters: {}, secrets: [], rerolls: 0, done: false, endless: false },
    islands: [],
    active: null,
  };
}

// a new world and its first island become the ones being played
function startWorld(settings, name) {
  W = makeWorld(settings, name);
  R = makeRules(W.settings, W.voyage);
  S = freshState(W.settings.seed, W.settings.size, W.settings);
  S.node = 0; S.name = W.chart.nodes[0].name;
}

// a loaded world becomes the one being played; its island keeps the size it was made with
function openWorld(w) {
  W = w;
  for (const k of ["rerolls", "done", "endless"]) if (!(k in W.voyage)) W.voyage[k] = k === "rerolls" ? 0 : false;
  R = makeRules(W.settings, W.voyage);
  const a = W.active;
  S = Object.assign(freshState(a.seed, a.n, { ...W.settings, traits: a.traits, chapter: a.chapter }), a);
  W.active = null; // S is the truth while playing
}

const ISLE_FIRST = ["Gannet", "Kittle", "Brindle", "Saltmere", "Hollow", "Wicken", "Merrow", "Tansy", "Puffin", "Clover",
  "Heather", "Marram", "Oyster", "Pebble", "Rushy", "Samphire", "Thistle", "Amber", "Otter", "Cairn", "Fern", "Skerry"];
const ISLE_LAST = ["Holm", "Isle", "Eyot", "Rock", "Ness", "Key", "Tor", "Inch"];
const islandName = seed => `${ISLE_FIRST[hashInt(seed, 11) % ISLE_FIRST.length]} ${ISLE_LAST[hashInt(seed, 12) % ISLE_LAST.length]}`;

// how big an island of this chapter is: +2 tiles a chapter when islands grow, and the
// Great isle (the last chapter) and every island after it GREAT.bonus more
const finaleChapter = () => W.settings.length || Infinity;
const islandSize = ch => Math.min(ISLAND_MAX, (W.settings.grow ? W.settings.size + 2 * (ch - 1) : W.settings.size) + (ch >= finaleChapter() ? GREAT.bonus : 0));
const activeNode = () => W.chart.nodes.find(n => n.status === "active");

// ------------------------------------------------------------------ chart

// the traits this voyage has played (settled and active islands), and how often
const playedNodes = () => W.chart.nodes.filter(n => n.status === "settled" || n.status === "active");
const playedTraits = () => new Set(playedNodes().flatMap(n => n.traits));
function playCounts() {
  const c = {};
  for (const n of playedNodes()) for (const t of n.traits) c[t] = (c[t] || 0) + 1;
  return c;
}

// the two islands on offer from here: made once, then kept on the chart.  Each brings
// a trait not played yet while any remain ("always new"), and the two differ.  From
// chapter 3 on, an island has two traits
function offerIslands() {
  const here = activeNode(), ch = here.chapter + 1;
  const open = W.chart.nodes.filter(n => n.status === "open" && n.chapter === ch);
  if (open.length) return open;
  const r = rng(hashInt(W.settings.seed, ch, 7));
  // a Calm world has no storms, so no Storm coast.  The traits played least come first
  // (never played at all while any remain: "always new"; then round again, endlessly)
  const order = TRAIT_ORDER.filter(t => t !== "storm" || W.settings.weather !== "calm").sort(() => r() - 0.5), count = playCounts();
  const pool = order.map((t, k) => [count[t] || 0, k, t]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => e[2]), per = ch >= 3 ? 2 : 1;
  const firsts = [pool[0], pool.find(t => t !== pool[0])];
  const taken = new Set(W.chart.nodes.map(n => n.name));
  // the voyage's last island is the Great isle: a mix of the traits played so far, a
  // different mix on each offer
  const finale = ch === W.settings.length;
  const played = [...playedTraits()].filter(t => TRAIT_ORDER.includes(t));
  const offers = firsts.map((t, k) => {
    let traits = [t];
    if (finale) {
      const r2 = rng(hashInt(W.settings.seed, ch, k, 61)), mix = played.slice().sort(() => r2() - 0.5).slice(0, GREAT.mix);
      traits = ["great", ...(mix.length ? TRAIT_ORDER.filter(o => mix.includes(o)) : [t])];
    } else if (per > 1) traits.push(pool.find(o => o !== t && o !== firsts[1 - k]) || pool.find(o => o !== t));
    const seed = hashInt(W.settings.seed, ch, k, 31) % 1e9;
    // a name no island of this voyage has had yet (the island itself stays as its seed makes it)
    let name = islandName(seed);
    for (let j = 1; taken.has(name) && j < 50; j++) name = islandName(seed + j);
    taken.add(name);
    return { id: W.chart.nodes.length + k, x: here.x + 1, y: here.y + (k ? 0.9 : -0.9), chapter: ch, traits,
      size: islandSize(ch), seed, name, status: "open" };
  });
  for (const o of offers) { W.chart.nodes.push(o); W.chart.edges.push([here.id, o.id]); }
  return offers;
}

// boons and heirlooms on offer at a departure, never one already taken; a reroll
// (coins) draws again.  Met charters add a boon to pick, and one more to choose from
function offerBoons() {
  const r = rng(hashInt(W.settings.seed, W.voyage.chapter, 53, W.voyage.rerolls));
  const left = BOONS.filter(b => !W.voyage.boons.includes(b.id)).sort(() => r() - 0.5);
  return left.slice(0, 2 + chartersMet().length);
}
function offerHeirlooms() {
  const r = rng(hashInt(W.settings.seed, W.voyage.chapter, 57));
  return HEIRLOOMS.filter(h => !W.voyage.heirlooms.includes(h.id)).sort(() => r() - 0.5).slice(0, 2);
}
const rerollCost = () => 40 * W.voyage.chapter;

// ------------------------------------------------------------------ charters

// the island's two optional goals, from its traits; stats kept by the sim
function islandCharters(isl = S) {
  return isl.traits.flatMap(t => CHARTERS[t] || []).slice(0, 2);
}
function charterStat(stat) {
  if (stat === "cobbles") return [...S.cob].filter(c => c === "1").length;
  if (stat === "houses") return count("house");
  if (stat === "ghostCobbles") { let n = 0; for (let i = 0; i < N * N; i++) if (S.ghost[i] === "1" && S.cob[i] === "1") n++; return n; }
  if (stat === "lamps") return decoCount("l");
  // a path (or cobbles) on the highest ground
  if (stat === "summit") { if (!S.height) return 0; const top = Math.max(...[...S.height].map(Number)); for (let i = 0; i < N * N; i++) if (+S.height[i] === top && level(i) >= 2) return 1; return 0; }
  if (stat === "townhall") return hallStands() ? 1 : 0;
  if (stat === "farHomes") { const far = farIsle(); return S.b.filter(b => isHome(b) && far[idx(b.x, b.y)]).length; }
  return S.stats[stat] || 0;
}
const chartersMet = () => islandCharters().filter(c => charterStat(c.stat) >= c.goal);

// the Twin isles: the land across the strait from the hearth (1 = far), by the land
// alone (bridges over rivers count, the strait and its bridges don't)
function farIsle() {
  const seen = new Uint8Array(N * N), q = [idx(hearthB.x, hearthB.y)], far = new Uint8Array(N * N);
  seen[q[0]] = 1;
  const land = i => ".=#".includes(S.ground[i]) && S.soil[i] !== "c";
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of DIRS) { const j = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && !seen[j] && land(j)) { seen[j] = 1; q.push(j); } }
  }
  for (let i = 0; i < N * N; i++) if (S.ground[i] === "." && !seen[i]) far[i] = 1;
  return far;
}

// ------------------------------------------------------------------ letters

// trade with a settled island: its tribute grows a level for every letter answered
const tradeMult = isl => 1 + LETTER.grow * (isl.trade ? isl.trade.level : 0);
// each morning a settled island may write, asking for something the village makes:
// goods, wood, coins, or this island's own trade.  Seeded by (the island, this island, the day)
function lettersMorning() {
  if (!W || !W.islands.length) return;
  W.islands.forEach((isl, k) => {
    if (!isl.trade) isl.trade = { level: 0, ask: null, done: 0 };
    const a = isl.trade.ask;
    if (a && S.day > a.until) { isl.trade.ask = null; chron("letter", `${isl.name}'s letter went unanswered.`); }
    if (isl.trade.ask || (S.day + k * 3) % LETTER.every || hashInt(isl.seed, S.seed, S.day, 0x1e7) / 4294967296 >= LETTER.p) return;
    const wants = ["goods", "wood", "coin", ...S.traits.map(t => (TRAITS[t] || {}).good).filter(g => ["stone", "clay", "wool", "pearl"].includes(g))];
    const res = wants[hashInt(isl.seed, S.day, 0x1e8) % wants.length], lv = Math.min(isl.trade.level, LETTER.top);
    const n = res === "coin" ? LETTER.coin + LETTER.perCoin * lv : LETTER.base + LETTER.per * lv;
    isl.trade.ask = { res, n, until: S.day + LETTER.days };
    chron("letter", `A letter from *${isl.name}*: they ask for *${n} ${res}*.`);
    moments.letters.push({ name: isl.name, res, n });
  });
}
// the asks open now, with the forecast's word on whether tonight's boat takes it
const openLetters = () => (W ? W.islands.filter(i => i.trade && i.trade.ask).map(i => ({ isl: i, ...i.trade.ask })) : []);

// ------------------------------------------------------------------ sailing

const crewSize = () => Math.min(CREW.max, CREW.base + Math.floor(peakOf(S) / CREW.per));
const peakOf = isl => Math.max(isl.stats.peak || 0, isl.vil.length);
// by default the longest-serving villagers sail
const defaultCrew = () => S.vil.slice().sort((a, b) => a.id - b.id).slice(0, crewSize()).map(v => v.id);
const shipReady = () => S.b.some(b => b.t === "ship" && !b.site);

// what an island sends home every TRIBUTE_EVERY days: its specialty and a little
// food and wood, by the size it reached
function tributeOf(isl) {
  const base = Math.max(1, Math.floor(peakOf(isl) / 12)), t = { food: base * 2, wood: base };
  for (const tr of isl.traits) { const g = TRAITS[tr].good; t[g] = (t[g] || 0) + base * (g === "coin" ? 4 : 2); }
  return t;
}

// the island as it was when the ship left: never simulated again, kept small
// (the path level per tile, not the wear) for the chart, the horizon and visits
function freeze(isl) {
  const lvl = []; for (let i = 0; i < isl.n * isl.n; i++) lvl.push(isl.cob[i] === "1" ? 3 : isl.wear[i] >= R.wear.path ? 2 : isl.wear[i] >= R.wear.trail ? 1 : 0);
  return {
    node: isl.node, name: isl.name, seed: isl.seed, n: isl.n, traits: isl.traits, chapter: isl.chapter,
    days: isl.day, peak: peakOf(isl), stats: { ...isl.stats, cobbles: charterStat("cobbles"), houses: count("house") },
    charters: chartersMet().map(c => c.id), secrets: (isl.secrets || []).slice(),
    trade: { level: 0, ask: null, done: 0 },
    frozen: { ground: isl.ground, feat: isl.feat, soil: isl.soil, cob: isl.cob, deco: isl.deco, ghost: isl.ghost, lvl: lvl.join(""),
      ...(isl.height ? { height: isl.height } : {}), scar: isl.scar || [], pattern: isl.pattern || "cobble",
      b: isl.b.filter(b => !b.site).map(b => [b.id, b.t, b.x, b.y, b.look]), vil: isl.vil.map(v => [v.id, v.home, v.look, v.name]) },
    tribute: tributeOf(isl),
  };
}

// sail: the island is frozen and settled, the picks are kept, and the crew lands
// on the chosen island with a little stock from the old one.  choice: { node, boons,
// heirloom, crew } (ids); anything missing takes the default
function sail(choice = {}) {
  const offers = offerIslands(), node = W.chart.nodes.find(n => n.id === choice.node) || offers[0];
  const boons = choice.boons || offerBoons().slice(0, 1 + chartersMet().length).map(b => b.id);
  const heirloom = choice.heirloom || (offerHeirlooms()[0] || {}).id;
  const crewIds = choice.crew || defaultCrew(), crew = S.vil.filter(v => crewIds.includes(v.id));
  const stock = { food: 10 + 2 * crew.length, wood: 20 + 2 * crew.length, coin: Math.min(S.coin, 60 * W.voyage.chapter),
    goods: Math.min(S.goods, 20), stone: Math.min(S.stone, 20), clay: Math.min(S.clay, 20) };
  const left = freeze(S);
  W.voyage.charters[S.node] = left.charters;
  W.islands.push(left);
  // letters wait for the island they were written to: a new island starts with none
  for (const isl of W.islands) if (isl.trade) isl.trade.ask = null;
  for (const n of W.chart.nodes) {
    if (n.status === "active") n.status = "settled";
    else if (n.status === "open" && n.chapter === node.chapter) n.status = n === node ? "active" : "closed";
  }
  W.voyage.chapter = node.chapter;
  W.voyage.boons.push(...boons);
  if (heirloom) W.voyage.heirlooms.push(heirloom);
  W.voyage.rerolls = 0;
  W.voyage.secrets = [...new Set([...(W.voyage.secrets || []), ...left.secrets])];
  R = makeRules(W.settings, W.voyage);
  S = landCrew(node, crew, stock);
  return S;
}

// a new island with the crew on it: their homes round the hearth, the stock they
// brought, every building they already know
function landCrew(node, crew, stock) {
  const s = freshState(node.seed, node.size, { ...W.settings, traits: node.traits, chapter: node.chapter });
  S = s;
  reindex();
  Object.assign(s, { node: node.id, name: node.name, ms: MILESTONES.length - 1, seen: true, vil: [], nextV: 1 }, stock);
  const hearth = s.b.find(b => b.t === "hearth");
  const homes = [s.b.find(b => b.t === "cottage")];
  // cottages on every other tile of the rings round the square, clearing what grows there
  for (let d = 2; d <= 4 && homes.length < Math.ceil(crew.length / 2); d++) {
    for (let j = -d; j <= d && homes.length < Math.ceil(crew.length / 2); j++) for (let i = -d; i <= d && homes.length < Math.ceil(crew.length / 2); i++) {
      const x = hearth.x + i, y = hearth.y + j;
      if (Math.max(Math.abs(i), Math.abs(j)) !== d || (i + j) % 2 || !inMap(x, y) || s.ground[idx(x, y)] !== "." || bAt(x, y)) continue;
      if (s.soil[idx(x, y)] === "w" || "rkuUq".includes(s.feat[idx(x, y)])) continue;
      setChar("feat", x, y, ".");
      homes.push(addBuilding(s, "cottage", x, y));
      reindex();
    }
  }
  crew.forEach((v, k) => {
    const nv = addVillager(s, homes[Math.min(homes.length - 1, Math.floor(k / 2))].id);
    nv.name = v.name; nv.look = v.look;
  });
  s.stats.crew = crew.length;
  reindex();
  chron("voyage", `Landfall: the crew from ${W.islands.length ? W.islands[W.islands.length - 1].name : "home"} comes ashore (*${crew.length}* villagers).`);
  return s;
}

// a settled island being looked at (chart.js): nothing is saved while it is
let visiting = null;

// the realm: everyone on the island, and everyone on the islands left behind
const realmPop = () => pop() + (W ? W.islands.reduce((a, i) => a + i.peak, 0) : 0);
