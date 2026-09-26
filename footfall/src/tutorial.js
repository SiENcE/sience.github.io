/* The tutorial, woven into play — no text boxes.
 *
 * Each lesson waits for its moment (`when`), shows one cue inside the game — a
 * pixel hand, corner brackets around the target, at most one caps word — and
 * ends as soon as the player has done the thing (`done`), cue or not.  Only one
 * cue is on screen at a time; the order of LESSONS is the priority.
 *
 * Build lessons have two steps: the hand points at the card, and once the card
 * is picked it points at a good tile.  The game also teaches by what it shows:
 * the first day plays slowly and its new trails light up; the coin counter and
 * the milestone plate only appear once they matter (revealed()).  Every lesson
 * has a codex page (help.js), whose SHOW ME replays the cue.
 */
"use strict";

const tut = { active: null, t: 0, slow: 1, moment: null, replay: null, reveal: { coin: 0, goods: 0, stone: 0, clay: 0, wool: 0, pearl: 0, goal: 0, weather: 0 }, ghost: null, target: null,
  news: null, secret: null };

const learned = id => PROFILE.learned.includes(id);
function learn(id) { if (!learned(id)) { PROFILE.learned.push(id); saveProfile(); } }
const riverLeft = () => S.ground.includes("=");

// build lessons: the building, and when it becomes the thing to do
const BUILD_LESSON = { cutter: "woodcutter", field: "field", house: "cottage", fisher: "fisher", market: "market",
  bridge: "bridge", grove: "grove", well: "well", tavern: "tavern", lighthouse: "lighthouse",
  workshop: "workshop", rebuild: "house", street: "stall",
  ship: "ship", harbour: "harbour", quarry: "quarry", pave: "pave", claypit: "claypit", boardwalk: "boardwalk",
  shepherd: "shepherd", lodge: "lodge", pier: "pier", causeway: "causeway", seawall: "seawall",
  townhall: "townhall", grandmarket: "grandmarket", reclaim: "reclaim", ferry: "ferry", longbridge: "longbridge" };
const built = t => (t === "bridge" ? S.ground.includes("#") : t === "grove" ? (S.stats.planted || 0) > 0
  : t === "causeway" ? (S.stats.causeways || 0) > 0 : t === "seawall" ? (S.stats.seawalls || 0) > 0
  : t === "reclaim" ? (S.stats.reclaimed || 0) > 0 : t === "longbridge" ? (S.stats.longbridges || 0) > 0
  : BD[t] && BD[t].deco ? S.deco.includes(BD[t].deco) : t === "house" ? S.b.some(b => b.t === "house" || b.to === "house") : count(t) > 0);
const newBuild = id => () => unlocked(BD[BUILD_LESSON[id]]) && canAfford(BD[BUILD_LESSON[id]]) && !day.on;

const LESSONS = [
  { id: "cutter", when: () => !day.on, done: () => count("woodcutter") > 0 },
  { id: "field", when: () => learned("cutter") && !day.on, done: () => count("field") > 0 },
  { id: "endday", when: () => learned("field") && !day.on, done: () => S.day > 1 },
  { id: "paths", when: () => !!tut.moment, done: () => false },
  { id: "house", when: () => S.day > 1 && !day.on && pop() >= totalBeds() && canAfford(BD.cottage), done: () => count("cottage") >= 2 },
  { id: "grow", when: () => tut.flash && tut.flash.id === "grow", done: () => false },
  { id: "goal", when: () => S.day >= 3 && !day.on, done: () => tut.active === "goal" && tut.t > 4 },
  { id: "commute", when: () => !day.on && !!tiredWorkplace(), done: () => ui.inspected && tiredWorkplace() && ui.inspected === tiredWorkplace().id },
  { id: "fisher", when: newBuild("fisher"), done: () => built("fisher") },
  { id: "market", when: newBuild("market"), done: () => built("market") },
  { id: "bridge", when: () => newBuild("bridge")() && riverLeft(), done: () => built("bridge") },
  { id: "grove", when: () => newBuild("grove")() && count("woodcutter") > 0, done: () => built("grove") },
  { id: "well", when: newBuild("well"), done: () => built("well") },
  { id: "tavern", when: newBuild("tavern"), done: () => built("tavern") },
  { id: "lighthouse", when: newBuild("lighthouse"), done: () => built("lighthouse") },
  // the jobs rework: goods, houses, free hands and building sites, streets, sleep
  { id: "workshop", when: () => newBuild("workshop")() && unlocked(BD.house), done: () => built("workshop") },
  { id: "rebuild", when: () => newBuild("rebuild")() && !!suggestTile("house"), done: () => built("house") },
  { id: "hands", when: () => !day.on && S.b.some(b => b.site), done: () => tut.active === "hands" && tut.t > 4 },
  { id: "street", when: () => newBuild("street")() && S.cob.includes("1"), done: () => built("stall") || built("bench") },
  { id: "sleep", when: () => S.day >= 8 && !day.on && learned("goal"), done: () => ui.sleep },
  // voyages: the ship, sailing, the chart; each new island teaches its own trade
  { id: "ship", when: () => newBuild("ship")(), done: () => built("ship") },
  { id: "sail", when: () => !day.on && !!W && shipReady(), done: () => S.chapter > 1 },
  { id: "chart", when: () => !day.on && S.chapter > 1, done: () => !!ui.chart },
  { id: "harbour", when: () => newBuild("harbour")() && !!W && W.islands.length > 0, done: () => built("harbour") },
  { id: "quarry", when: newBuild("quarry"), done: () => built("quarry") },
  { id: "pave", when: () => newBuild("pave")() && S.stone >= 2, done: () => (S.stats.paved || 0) > 0 },
  { id: "claypit", when: newBuild("claypit"), done: () => built("claypit") },
  { id: "boardwalk", when: newBuild("boardwalk"), done: () => (S.stats.boardwalks || 0) > 0 },
  { id: "ruins", when: () => !day.on && S.feat.includes("u"), done: () => (tut.active === "ruins" && tut.t > 5) || S.feat.includes("U") },
  // weather: the strip, and each kind of day the first time it shows; the new traits' trades
  { id: "weather", when: () => !day.on && revealed("weather") > 0.9, done: () => tut.active === "weather" && tut.t > 4 },
  { id: "winter", when: () => !day.on && wx().snow && wx().rules, done: () => tut.active === "winter" && tut.t > 4 },
  { id: "storm", when: () => !day.on && forecastDays(3).some(X => X.storm), done: () => tut.active === "storm" && tut.t > 4 },
  { id: "rise", when: () => !day.on && forecastDays(3).some(X => X.rise), done: () => tut.active === "rise" && tut.t > 4 },
  { id: "tide", when: () => !day.on && wx().tide, done: () => tut.active === "tide" && tut.t > 5 },
  { id: "heights", when: () => !day.on && !!S.height, done: () => tut.active === "heights" && tut.t > 5 },
  { id: "shepherd", when: newBuild("shepherd"), done: () => built("shepherd") },
  { id: "lodge", when: newBuild("lodge"), done: () => built("lodge") },
  { id: "pier", when: newBuild("pier"), done: () => built("pier") },
  { id: "causeway", when: newBuild("causeway"), done: () => built("causeway") },
  { id: "seawall", when: () => newBuild("seawall")() && forecastDays(3).some(X => X.storm), done: () => built("seawall") },
  // moments (events.js, shapes.js): each the first time it happens
  { id: "stranger", when: () => !day.on && momentSpot("stranger") >= 0, done: () => (tut.active === "stranger" && tut.t > 5) || (S.stats.castaways || 0) > 0 },
  { id: "herd", when: () => !day.on && !!forecast && forecast.herds.length > 0, done: () => tut.active === "herd" && tut.t > 5 },
  { id: "wreck", when: () => !day.on && momentSpot("wreck") >= 0, done: () => tut.active === "wreck" && tut.t > 5 },
  { id: "merchant", when: () => !day.on && (merchantDue() || (!!S.shop && S.shop.day === S.day)), done: () => ui.shop || (tut.active === "merchant" && tut.t > 6) },
  { id: "feast", when: () => !day.on && S.feast === S.day, done: () => tut.active === "feast" && tut.t > 4 },
  { id: "secret", when: () => !day.on && PROFILE.secrets.length > 0, done: () => (ui.codex && ui.codex.cat === "secrets") || (tut.active === "secret" && tut.t > 6) },
  // phase 5: the town hall and what it brings, the Atoll and the Twin isles, letters,
  // the pirates, the chronicle, the voyage's end
  { id: "townhall", when: newBuild("townhall"), done: () => built("townhall") },
  { id: "grandmarket", when: newBuild("grandmarket"), done: () => built("grandmarket") },
  { id: "reclaim", when: () => newBuild("reclaim")() && pop() >= totalBeds(), done: () => built("reclaim") },
  { id: "ferry", when: newBuild("ferry"), done: () => built("ferry") },
  { id: "longbridge", when: newBuild("longbridge"), done: () => built("longbridge") },
  { id: "letters", when: () => !day.on && openLetters().length > 0, done: () => (tut.active === "letters" && tut.t > 5) || (S.stats.letters || 0) > 0 },
  { id: "treasure", when: () => !day.on && !!S.ev && !!S.ev.cur && S.ev.cur.id === "treasure", done: () => tut.active === "treasure" && tut.t > 5 },
  { id: "chronicle", when: () => !day.on && S.day >= 15 && learned("goal"), done: () => !!ui.stats },
  { id: "grand", when: () => !day.on && !!W && W.voyage.done, done: () => (tut.active === "grand" && tut.t > 5) || W.voyage.endless },
  { id: "pan", when: () => S.day >= 2 && !day.on && learned("house"), done: () => ui.panned > 80 },
];
// where the event under way waits (its tile), or -1
const momentSpot = id => (S.ev && S.ev.cur && S.ev.cur.id === id && S.ev.cur.at !== undefined ? S.ev.cur.at : -1);

const tiredWorkplace = () => {
  if (!forecast) return null;
  const id = Object.keys(forecast.out).find(k => forecast.out[k].tired);
  return id ? bById(+id) : null;
};

function revealTarget(k) {
  if (!PROFILE.hints) return true;
  const rp = tut.replay && tut.replay.id;
  if (k === "coin") return unlocked(BD.market) || S.coin > 0 || rp === "market";
  if (k === "goods") return unlocked(BD.workshop) || S.goods > 0 || rp === "workshop";
  if (k === "stone") return S.stone > 0 || S.traits.includes("stony");
  if (k === "clay") return S.clay > 0 || S.traits.includes("marsh");
  if (k === "wool") return S.wool > 0 || S.traits.includes("highlands");
  if (k === "pearl") return S.pearl > 0 || S.traits.includes("atoll");
  if (k === "weather") return S.day >= 3 || S.chapter > 1 || rp === "weather";
  return learned("goal") || tut.active === "goal" || S.ms > 0 || rp === "goal";
}
const revealed = k => tut.reveal[k];

function tutReset() {
  Object.assign(tut, { active: null, t: 0, slow: 1, moment: null, replay: null, ghost: null, flash: null });
  for (const k in tut.reveal) tut.reveal[k] = revealTarget(k) ? 1 : 0;
}

// at boot: a returning player skips what their village shows they already know
function tutInit() {
  if (params.has("demo")) { PROFILE.learned = LESSONS.map(l => l.id); PROFILE.read = PAGES.map(p => p.id); }
  if (S.day > 1) learn("endday");
  if (S.day > 2) learn("paths");
  if (S.stats.arrived > 0) learn("grow");
  for (const l of LESSONS) if (!["goal", "commute", "pan", "weather", "winter", "storm", "rise", "tide", "heights", "stranger", "herd", "wreck", "merchant", "feast", "secret", "letters", "treasure", "chronicle", "grand"].includes(l.id) && l.done()) learn(l.id);
  tutReset();
}

// ------------------------------------------------------------------ update

function tutUpdate(dt) {
  for (const l of LESSONS) if (!learned(l.id) && l.done()) learn(l.id);
  const next = PROFILE.hints && !ui.title && !visiting ? LESSONS.find(l => !learned(l.id) && l.when()) : null;
  const id = next ? next.id : null;
  if (id !== tut.active) { tut.active = id; tut.t = 0; tut.ghost = null; tut.target = null; }
  tut.t += dt;

  for (const k in tut.reveal) {
    const d = (revealTarget(k) ? 1 : 0) - tut.reveal[k];
    tut.reveal[k] += Math.sign(d) * Math.min(Math.abs(d), dt * 2.5);
  }
  if (tut.replay && (tut.replay.t += dt) > 7) tut.replay = null;

  // the first day walks slowly so the player can watch the feet
  tut.slow = day.on && day.first && PROFILE.hints && !day.fast ? 0.6 : 1;

  if (tut.moment && (tut.moment.t += dt) > 4.5) { tut.moment = null; learn("paths"); }
  // the morning's news (an event begins, the merchant's stall) and a secret's tiles
  if (tut.news && (tut.news.t += dt) > 5) tut.news = null;
  if (tut.secret && (tut.secret.t += dt) > 5) tut.secret = null;
  if (tut.flash && (tut.flash.t += dt) > 3.5) { if (tut.flash.id === "grow") learn("grow"); tut.flash = null; }
}

// called when a day has been played out
function tutAfterDay(P) {
  if (!learned("paths") && PROFILE.hints) {
    const tiles = [];
    for (let i = 0; i < N * N; i++) if (level(i) > 0) tiles.push(i);
    if (tiles.length) {
      tut.moment = { t: 0, tiles };
      const i = tiles[(tiles.length / 2) | 0], [sx, sy] = tileMid(i % N, (i / N) | 0);
      for (const j of tiles) { const [x, y] = tileMid(j % N, (j / N) | 0); burst(x, y, C.gold, 3, 18); }
      floatText(sx, sy - 12, "TRAIL", C.gold, "caps", null, 2.5);
      sfx.path();
    } else learn("paths");
  }
  if (!learned("grow") && day.arrived && day.arrived.length && PROFILE.hints) tut.flash = { id: "grow", t: 0 };
  else if (day.arrived && day.arrived.length) learn("grow");
}

// a day has begun: what the morning brings is announced with a cue (whatever the
// hints setting: it is news, not a hint)
function tutNews() {
  const M = moments;
  if (M.started) tut.news = { id: M.started.id, t: 0 };
  else if (S.shop && S.shop.day === S.day) tut.news = { id: "shop", t: 0 };
  else if (S.feast === S.day) tut.news = { id: "feast", t: 0 };
  if (tut.news && ["stranger", "herd", "wreck", "feast", "treasure"].includes(tut.news.id)) learn(tut.news.id);
}

// replay a lesson's cue from the codex
function tutReplay(id) {
  tut.replay = { id, t: 0 };
  // a secret: where the shape is on this island now, if it is
  const sec = SECRETS.find(s => s.id === id);
  if (sec) { tut.replay.id = "secret"; const t = sec.event ? S.feat.indexOf("S") >= 0 ? [S.feat.indexOf("S")] : null : shapeTiles(id); tut.secret = t ? { t: 0, tiles: t } : null; return; }
  if (id === "paths") {
    const tiles = [];
    for (let i = 0; i < N * N; i++) if (level(i) > 0) tiles.push(i);
    tut.replay.tiles = tiles;
  }
}

// a good tile for a build lesson: scored, nearest the village on ties
function suggestTile(t) {
  const def = BD[t], hearth = S.b.find(b => b.t === "hearth");
  let best = null, bs = -Infinity;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (placeProblem(def, x, y)) continue;
    const dist = Math.abs(x - hearth.x) + Math.abs(y - hearth.y);
    let s = -dist * 0.3;
    if (t === "woodcutter") s += Math.min(4, Math.floor(treesNear(x, y) / 2)) * 3;
    if (t === "field") s += fieldsBeside(x, y) * 2 + (meadow(x, y) ? 4 : 0) - Math.max(0, dist - 3) * 0.5;
    if (t === "market") { const f = [0, ...RING.map(([dx, dy]) => inMap(x + dx, y + dy) ? S.foot[idx(x + dx, y + dy)] : 0)]; s += Math.max(...f) * 2; }
    if (t === "well") s += S.b.filter(c => c.t === "cottage" && cheb(c, { x, y }) <= R.wellRadius).length * 3;
    if (t === "cottage") s += (streetFront(x, y) ? 3 : 0) + (nearWell(x, y) ? 3 : 0);
    // a house where its people already pass a market and meet in the evening
    if (t === "house") {
      const res = S.vil.filter(v => v.home === bAt(x, y).id);
      if (!forecast || !res.some(v => forecast.shops[v.id])) continue;
      s += res.length * 2 + (streetFront(x, y) ? 2 : 0);
    }
    if (t === "stall") { if (S.foot[idx(x, y)] < 3) continue; s = S.foot[idx(x, y)]; }
    if (t === "pave" || t === "boardwalk") s = S.foot[idx(x, y)] * 2 - dist * 0.2 + DIRS.filter(([dx, dy]) => level(idx(x + dx, y + dy)) > 0).length;
    if (t === "quarry") s += rocksBeside(x, y) * 3;
    if (t === "claypit") s += marshBeside(x, y) * 3;
    if (t === "shepherd") s += grassNear(x, y) - Math.max(0, dist - 5);
    if (t === "pier") s += sandbarsNear(x, y) * 3;
    if (t === "lodge") s += S.b.filter(c => isHome(c) && cheb(c, { x, y }) <= 2).length * 3;
    if (t === "causeway") s = -dist * 0.3 + DIRS.filter(([dx, dy]) => walkable(x + dx, y + dy)).length * 3;
    if (t === "seawall") { const fl = floodTiles(); s = -dist * 0.1 + DIRS.filter(([dx, dy]) => { const o = bAt(x + dx, y + dy); return o && o.t === "field"; }).length * 4 + (fl[idx(x, y)] ? 2 : 0); }
    // a bridge wants land on both banks, facing each other
    if (t === "bridge") s += (isLand(x - 1, y) && isLand(x + 1, y)) || (isLand(x, y - 1) && isLand(x, y + 1)) ? 6 : -6;
    if (t === "grove") s = -Math.min(...S.b.filter(b => b.t === "woodcutter").map(b => cheb(b, { x, y }))) * 2 - dist * 0.1 - (level(idx(x, y)) ? 5 : 0);
    // don't suggest building on a trodden path
    if (t !== "bridge" && level(idx(x, y)) > 0) s -= 3;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  return best;
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
const HAND_COL = { o: C.ink, w: "#fff8ec", s: "#c8b8a8", ".": null };
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
function pointAt(x, y, word, tapping = true, wordAt = null) {
  const ph = (now * 1.4) % 1, press = tapping && ph < 0.22;
  if (press) { ctx.globalAlpha = 0.8; ring(x, y, 2 + ph * 14, C.gold, 3); ctx.globalAlpha = 1; }
  drawHand(x, y + (tapping ? 0 : Math.round(Math.sin(now * 3))), press);
  if (word) cueWord(word, ...(wordAt || [x + 11, y + 5]));
}
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

// a pulsing tile on the map with the hand on it
function pointTile(x, y, word) {
  inWorld(() => {
    const [sx, sy] = tileTop(x, y);
    drawTile(sx, sy, C.gold, Math.floor(now * 3) % 2 ? "6" : "3");
    drawTile(sx, sy, C.gold, "edge");
    pointAt(sx + 1, sy + 9, word);
  });
}
// the hand on a tile of the island (drawn in the island's view, so it zooms with it)
const pointAtTile = (i, word, dy = 9) => inWorld(() => { const [sx, sy] = tileTop(i % N, (i / N) | 0); pointAt(sx + 1, sy + dy, word); });

function drawTutorial() {
  if (ui.codex || ui.modal || ui.title || ui.chart || ui.shop || visiting) return;
  if (tut.moment) drawPathMoment(tut.moment.tiles, tut.moment.t);
  if (tut.secret) drawPathMoment(tut.secret.tiles, tut.secret.t);
  if (tut.news && !day.on && drawMomentCue(tut.news.id)) return;
  if (tut.flash) {
    const h = bracketHot("pop");
    if (h) cueWord("+1", h.x - 18, h.y + 5);
  }
  const cue = tut.replay ? tut.replay.id : tut.active;
  if (!cue) return;
  const replay = !!tut.replay;

  if (BUILD_LESSON[cue]) {
    if (day.on) return;
    const t = BUILD_LESSON[cue], def = BD[t], card = cardOf(t);
    if (ui.tool !== t) {
      // a building inside a category: first open the category's card, then pick from the row
      const h = bracketHot("card:" + (card !== t && ui.flyout !== card ? card : t));
      if (h && (canAfford(def) || replay)) pointAt(h.x + 13, h.y + 14, "BUILD", true, [h.x + 2, h.y - 11]);
    } else {
      if (!tut.target || tut.target.t !== t || placeProblem(def, ...tut.target.xy)) {
        const xy = suggestTile(t);
        tut.target = xy ? { t, xy } : null;
      }
      if (tut.target) pointTile(...tut.target.xy, "HERE");
    }
  } else if (cue === "endday") {
    const h = bracketHot("endday");
    if (h && !day.on) pointAt(h.x + h.w / 2, h.y + 18);
  } else if (cue === "paths" && replay) {
    drawPathMoment(tut.replay.tiles, tut.replay.t);
  } else if (cue === "grow" && replay) {
    bracketHot("pop");
  } else if (cue === "sail") {
    const h = bracketHot("sail");
    if (h) pointAt(h.x + h.w / 2, h.y + 7, "SAIL", true, [h.x - 26, h.y + 3]);
  } else if (cue === "chart") {
    const h = bracketHot("chart");
    if (h) cueWord("CHART", h.x + 16, h.y + 3);
  } else if (cue === "weather" || cue === "winter" || cue === "rise") {
    const h = bracketHot("wx:0");
    if (h) cueWord({ weather: "WEATHER", winter: "WINTER", rise: "THE SEA RISES" }[cue], h.x + h.w * 3 + 6, h.y + 7);
  } else if (cue === "storm") {
    const k = Math.max(0, forecastDays(3).findIndex(X => X.storm)), h = bracketHot("wx:" + k);
    if (h) cueWord("STORM", h.x + h.w * (3 - k) + 6, h.y + 7);
  } else if (cue === "tide") {
    const i = S.ground.indexOf("_");
    if (i >= 0) pointAtTile(i, "LOW TIDE");
  } else if (cue === "heights") {
    const i = riserNearHearth();
    if (i >= 0) pointAtTile(i, "UPHILL");
  } else if (cue === "ruins") {
    const i = S.feat.indexOf("u");
    if (i >= 0) pointAtTile(i, "RUIN", 4);
  } else if (cue === "letters") {
    const h = bracketHot("letters");
    if (h) cueWord("LETTER", h.x - 44, h.y + 3);
  } else if (cue === "chronicle") {
    const h = bracketHot("stats");
    if (h) cueWord("CHRONICLE", h.x + 16, h.y + 3);
  } else if (cue === "grand") {
    const h = bracketHot("goal");
    if (h) cueWord("SAIL ON?", h.x - 58, h.y + 3);
  } else if (cue === "hands") {
    const h = bracketHot("hands");
    if (h) cueWord("BUILDERS", h.x - 44, h.y + 5);
  } else if (cue === "sleep") {
    const h = bracketHot("sleep");
    if (h && !day.on) pointAt(h.x + h.w / 2, h.y + 7, "SLEEP", true, [h.x - 34, h.y + 3]);
  } else if (cue === "goal") {
    const h = bracketHot("goal");
    if (h) cueWord("GOAL", h.x - 30, h.y + 9);
  } else if (cue === "commute") {
    const b = tiredWorkplace() || (replay && longestWalk());
    if (b && !day.on && (replay || ui.inspected !== b.id)) inWorld(() => {
      const [sx, sy] = tileTop(b.x, b.y);
      drawCommute(b);
      pointAt(sx + 2, sy + 4, "FAR");
    });
  } else if (cue === "pan") drawGhostDrag();
  else if (["stranger", "herd", "wreck", "merchant", "feast", "secret", "treasure"].includes(cue) && !day.on && !(cue === "secret" && replay)) drawMomentCue(cue);
}

// a moment's cue: the hand on the spot an event waits at, the herd's shore, the
// merchant's cart (or its sail in the strip), the hearth on a feast day, the codex for a
// secret.  Off screen, the hand waits at the edge, pointing the way.  false: nothing to show
function drawMomentCue(id) {
  const tileCue = (i, word) => inWorld(() => {
    const [sx, sy] = tileTop(i % N, (i / N) | 0), k = VIEW.ui.px / VIEW.world.px;
    const cx = Math.max(16, Math.min(VW - 40, sx + 1)), cy = Math.max(Math.round(40 * k), Math.min(VH - Math.round(70 * k), sy + 9));
    if (cx !== sx + 1 || cy !== sy + 9) cueWord("<>", cx - 14, cy + 5);
    pointAt(cx, cy, word);
  }) || true;
  if (id === "stranger" || id === "wreck") { const i = momentSpot(id); return i >= 0 && tileCue(i, id === "wreck" ? "WRECK" : "FOOTPRINTS"); }
  if (id === "herd") { const h = forecast && forecast.herds[0]; return !!h && tileCue(h.route ? h.route[0] : h.from, "HERD"); }
  // the pirates' ring (its middle, not the chest itself)
  if (id === "treasure") { const E = S.ev && S.ev.cur; if (!E || E.id !== "treasure") return false; const g = treasureRing(E); return tileCue(idx(g.x, g.y), "TREASURE"); }
  if (id === "feast") return tileCue(idx(hearthB.x, hearthB.y), "FEAST");
  if (id === "shop" || id === "merchant") {
    const cart = merchantCart();
    if (cart) return tileCue(idx(cart[0], cart[1]), "MERCHANT");
    const k = [0, 1, 2].find(d => merchantDue(S.day + d)), h = k !== undefined && bracketHot("wx:" + k);
    if (h) cueWord("MERCHANT", h.x + h.w * (3 - k) + 6, h.y + 7);
    return !!h;
  }
  if (id === "secret") { const h = bracketHot("help"); if (h) cueWord("SECRET", h.x + 16, h.y + 3); return !!h; }
  return false;
}

// a slope near the village, for the Highlands' lesson
function riserNearHearth() {
  if (!S.height) return -1;
  let best = -1, bd = Infinity;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0, d = Math.abs(x - hearthB.x) + Math.abs(y - hearthB.y);
    if (d < bd && walkable(x, y) && DIRS.some(([dx, dy]) => inMap(x + dx, y + dy) && heightAt(idx(x + dx, y + dy)) > heightAt(i))) { bd = d; best = i; }
  }
  return best;
}

function longestWalk() {
  if (!forecast || !forecast.walks.length) return null;
  const w = forecast.walks.filter(w => bById(w.job).t !== "hearth").sort((a, b) => b.commute - a.commute)[0];
  return w ? bById(w.job) : null;
}

// new trails light up in a wave, the first time they appear
function drawPathMoment(tiles, t) {
  inWorld(() => tiles.forEach((i, k) => {
    const x = i % N, y = (i / N) | 0, [sx, sy] = tileTop(x, y);
    const on = Math.floor(t * 6 - k * 0.5) % 3 === 0;
    if (t * 6 > k * 0.5) drawTile(sx, sy, C.gold, on ? "edge" : "2");
  }));
}

// a ghost hand drags the island sideways and back
function drawGhostDrag() {
  const ph = (now % 2.4) / 2.4, held = ph > 0.15 && ph < 0.75;
  const x = VW / 2 + 60 + (held ? -Math.sin(((ph - 0.15) / 0.6) * Math.PI) * 30 : 0), y = VH / 2 + 10;
  drawHand(x, y, held, 0.85);
  cueWord("DRAG", x + 12, y + 5);
}
