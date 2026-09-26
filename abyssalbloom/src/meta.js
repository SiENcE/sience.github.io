/* The Depth Log: everything that survives Descend.
 *
 *   black pearls  earned by gates, trials, secrets, the bestiary and shinies;
 *                 spent on the Abyssal Tree
 *   tree          three branches (Web, Current, Heart), bought in order
 *   relics        found through secrets; equip as many as the tree gives slots
 *   trials        optional goals; each opens at a depth and stays open after,
 *                 some need a zone mechanic (vents, gulper, anchors)
 *   secrets       hidden interactions, hinted at in the log
 *   bestiary      every creature seen, and the shiny ones catalogued
 *   night tide    now and then the deep darkens and rare things come out
 *                 (on the local clock at night if real-time events are on)
 *
 * applyMeta(M) folds the tree and the equipped relics into the modifiers.
 */
"use strict";

// ------------------------------------------------------------ black pearls

function awardBlack(n, x = play.cx, y = play.cy - 40) {
  S.black += n;
  floatText(x, y, `+${n} BLACK PEARL${n > 1 ? "S" : ""}`, C.violet, "caps", 2.4);
  arpeggio([7, 9, 12, 14, 17], 0.05);
  save();
}

// --------------------------------------------------------------------- tree

const TREE = [
  { id: "web", name: "WEB", colour: "#c3a0ff", nodes: [
    { id: "w1", name: "Strong Threads", desc: "Threads are 10% stronger.", cost: 1, icon: "i_seahorse", apply: m => (m.link *= 1.1) },
    { id: "w2", name: "Wide Web", desc: "Threads reach 10% further.", cost: 2, icon: "i_jelly", apply: m => (m.range *= 1.1) },
    { id: "w3", name: "Seedling", desc: "Start every dive with 5 Glowmotes.", cost: 2, icon: "i_plankton", apply: m => (m.seed = 5) },
    { id: "w4", name: "Many Hands", desc: "Every creature holds one more thread.", cost: 5, icon: "i_angler", apply: m => (m.maxLinks += 1) },
    { id: "w5", name: "Resonant Deep", desc: "Threads are 25% stronger.", cost: 4, icon: "i_nautilus", apply: m => (m.link *= 1.25) },
    { id: "w6", name: "Deep Roots", desc: "Anchored creatures hold one more thread.", cost: 4, icon: "i_sponge", apply: m => (m.anchorLinks += 1) },
    { id: "w7", name: "Far Weave", desc: "Threads reach 15% further.", cost: 5, icon: "i_manta", apply: m => (m.range *= 1.15) },
    { id: "w8", name: "Endless Web", desc: "Resonance grows faster with every thread.", cost: 8, icon: "i_leviathan", apply: m => (m.resExp = 0.9) },
  ] },
  { id: "current", name: "CURRENT", colour: "#6ff3ff", nodes: [
    { id: "c1", name: "Deep Breath", desc: "The current drains 15% slower.", cost: 1, icon: "i_jelly", apply: m => (m.drain *= 0.85) },
    { id: "c2", name: "Undertow", desc: "The current pulls 20% harder; its threads reach 60% further.", cost: 2, icon: "i_manta", apply: m => { m.pull *= 1.2; m.currentReach = 1.6; } },
    { id: "c3", name: "Quick Tide", desc: "The current refills 50% faster.", cost: 2, icon: "i_plankton", apply: m => (m.refill *= 1.5) },
    { id: "c4", name: "Spore Sense", desc: "Spores drift by 25% more often.", cost: 3, icon: "i_spore", apply: m => (m.sporeRate *= 1.25) },
    { id: "c5", name: "Long Bloom", desc: "Bloom Frenzy lasts 30 seconds.", cost: 4, icon: "i_spore", apply: m => (m.frenzyT = 30) },
    { id: "c6", name: "Tide Memory", desc: "The reef gathers light for 12 hours while you are away.", cost: 4, icon: "i_pearl", apply: m => (m.offline = 12 * 3600) },
    { id: "c7", name: "Golden Catch", desc: "Spores that burst give twice the light.", cost: 5, icon: "i_spore", apply: m => (m.sporeBurst = 2) },
    { id: "c8", name: "Eternal Tide", desc: "During a Bloom Frenzy the current never drains.", cost: 8, icon: "i_leviathan", apply: m => (m.eternal = true) },
  ] },
  { id: "heart", name: "HEART", colour: "#ff7fc8", nodes: [
    { id: "h1", name: "Warm Heart", desc: "Taps are 50% brighter.", cost: 1, icon: "i_heart", apply: m => (m.click *= 1.5) },
    { id: "h2", name: "Quick Pulse", desc: "The heart beats every 2.8 seconds.", cost: 2, icon: "i_heart", apply: m => (m.beat = 2.8) },
    { id: "h3", name: "Old Echo", desc: "Every heartbeat taps the heart for you, from the start.", cost: 3, icon: "i_heart", apply: m => (m.echo = true) },
    { id: "h4", name: "Pearl Glow", desc: "Each pearl adds 11% instead of 10%.", cost: 5, icon: "i_pearl", apply: m => (m.pearlPct = 0.11) },
    { id: "h5", name: "Keeper", desc: "Start every dive with Sensitive Tendrils and Resonant Water.", cost: 4, icon: "i_pearl", apply: m => (m.keep = true) },
    { id: "h6", name: "Second Slot", desc: "Wear one more relic.", cost: 4, icon: "i_nautilus", apply: m => (m.relicSlots += 1) },
    { id: "h7", name: "Third Slot", desc: "Wear one more relic.", cost: 6, icon: "i_nautilus", apply: m => (m.relicSlots += 1) },
    { id: "h8", name: "Deep Heart", desc: "All light +25%.", cost: 8, icon: "i_heart", apply: m => (m.all *= 1.25) },
  ] },
];
const TREE_NODES = TREE.flatMap(b => b.nodes.map((n, i) => ({ ...n, branch: b, i })));
const treeHas = id => S.tree.includes(id);
// a node can be bought once the one above it in its branch is owned
const treeOpen = n => !treeHas(n.id) && (n.i === 0 || treeHas(n.branch.nodes[n.i - 1].id));

function buyNode(n) {
  if (!treeOpen(n) || S.black < n.cost) return false;
  S.black -= n.cost;
  S.tree.push(n.id);
  rebuildMods();
  arpeggio([2, 5, 9, 12], 0.05);
  save();
  return true;
}

// ------------------------------------------------------------------- relics

const RELICS = [
  { id: "bell", name: "Tide Bell", desc: "Every heartbeat refills the current a little.", icon: "r_bell",
    apply: m => (m.beatRefill = 12) },
  { id: "lantern", name: "Grotto Lantern", desc: "Spores drift by 50% more often.", icon: "r_lantern",
    apply: m => (m.sporeRate *= 1.5) },
  { id: "tooth", name: "Gulper's Tooth", desc: "Charged threads count triple instead of double.", icon: "r_tooth",
    apply: m => (m.chargeMult = 3) },
  { id: "scale", name: "Shiny Scale", desc: "All light +15%.", icon: "r_scale", apply: m => (m.all *= 1.15) },
];
const relicHas = id => S.relics.includes(id);

function findRelic(id) {
  if (relicHas(id)) return;
  S.relics.push(id);
  // wear it straight away if there is a free slot
  if (S.equip.length < M.relicSlots) S.equip.push(id);
  rebuildMods();
}
function toggleRelic(id) {
  if (S.equip.includes(id)) S.equip = S.equip.filter(r => r !== id);
  else if (relicHas(id) && S.equip.length < M.relicSlots) S.equip.push(id);
  else return false;
  rebuildMods(); save();
  chime(pent(8), 0.05, 1);
  return true;
}

// the tree and the worn relics, folded into the modifiers
function applyMeta(m) {
  Object.assign(m, { chargeMult: 2, resExp: 0.85, all: 1, beat: BEAT, refill: 9, frenzyT: 20, offline: 8 * 3600,
    sporeBurst: 1, eternal: false, relicSlots: 1, pearlPct: 0.1, currentReach: 1.4, beatRefill: 0, seed: 0, keep: false });
  for (const id of S.tree) TREE_NODES.find(n => n.id === id)?.apply(m);
  // a slot may have been lost (a wipe, an old save): wear only what fits
  S.equip = S.equip.filter(relicHas).slice(0, m.relicSlots);
  for (const id of S.equip) RELICS.find(r => r.id === id)?.apply(m);
}

// what the tree hands you at the start of every dive
function startDive() {
  S.run = { t: 0, taps: 0, spores: 0, cleanGulper: false };
  if (M.seed) S.owned.plankton = M.seed;
  if (M.keep) for (const id of ["tendrils", "threads"]) if (!S.upg.includes(id)) S.upg.push(id);
  rebuildMods();
}

// ------------------------------------------------------------------- trials

// `from`: the zone where a trial opens (it stays open deeper down);
// `mech`: a mechanic the zone must have for the trial to be possible there
const hasAnchors = () => shopSpecies().some(s => s.sessile);
const TRIALS = [
  { id: "quiet", from: 0, name: "Quiet Reef", desc: "Gather 1M light in one dive with fewer than 50 taps.",
    check: () => S.total >= 1e6 && S.run.taps < 50 },
  { id: "web20", from: 0, name: "Web of Twenty", desc: "Hold 20 threads at once.", check: () => linkCount >= 20 },
  { id: "spores5", from: 0, name: "Spore Catcher", desc: "Catch 5 spores in one dive.", check: () => S.run.spores >= 5 },
  { id: "swarm", from: 1, mech: "vents", name: "Warm Swarm", desc: "Gather 10 creatures in one vent's plume.",
    check: () => ventList.some(v => creatures.filter(c => (c.x - v.px) ** 2 + (c.y - v.py) ** 2 < v.r * v.r).length >= 10) },
  { id: "furnace", from: 1, mech: "vents", name: "Furnace", desc: "Hold 8 vent threads at once.", check: () => ventCharged >= 8 },
  { id: "clean", from: 2, mech: "gulper", name: "Clean Bite", desc: "Drive off a Gulper before it eats a single thread.",
    check: () => S.run.cleanGulper },
  { id: "glass", from: 2, mech: "anchors", name: "Glass Garden", desc: "Have 5 anchored creatures holding 4 threads each.",
    check: () => creatures.filter(c => c.s.sessile && c.links >= 4).length >= 5 },
  { id: "deepweb", from: 3, name: "Deep Web", desc: "Hold 40 threads at once.", check: () => linkCount >= 40 },
  { id: "swift", from: 3, name: "Swift Dive", desc: "Open the way down within 20 minutes of arriving.",
    check: () => S.run.t < 1200 && gateMet() && pearlsAvailable() >= 1 },
  { id: "chorus", from: 4, name: "Full Chorus", desc: "Own at least 10 of every core species.",
    check: () => SPECIES.filter(s => !s.zone).every(s => (S.owned[s.id] || 0) >= 10) },
  { id: "silent", from: 4, name: "Silent Choir", desc: "Gather 1M light in one dive without catching a spore.",
    check: () => S.total >= 1e6 && S.run.spores === 0 },
  { id: "pod", from: 5, name: "Leviathan Pod", desc: "Own 5 Abyssal Leviathans.", reward: 3,
    check: () => (S.owned.leviathan || 0) >= 5 },
  { id: "perfect", from: 5, name: "Perfect Resonance", desc: "Reach x6 Resonance.", reward: 3, check: () => resonance >= 6 },
];
const trialOpen = t => S.depth >= t.from;
const trialPossible = t => trialOpen(t) && (!t.mech || (t.mech === "anchors" ? hasAnchors() : Z.mechanic === t.mech));

function checkTrials() {
  for (const t of TRIALS) {
    if (S.trials.includes(t.id) || !trialPossible(t) || !t.check()) continue;
    S.trials.push(t.id);
    floatText(play.cx, play.cy - 58, "TRIAL: " + t.name.toUpperCase(), C.gold, "caps", 2.4);
    awardBlack(t.reward || 2);
  }
}

// ------------------------------------------------------------------ secrets

const SECRETS = [
  { id: "wink", name: "The Heart Winks", hint: "The heart keeps time. Keep it with it.", gives: "Tide Bell" },
  { id: "grotto", name: "The Lantern Grotto", hint: "Something breathes behind the trench wall.", gives: "Grotto Lantern, 5 black pearls" },
  { id: "tooth", name: "A Full Gulper", hint: "Let the hungry one feed. Fifty times.", gives: "Gulper's Tooth" },
  { id: "shiny", name: "A Rare Light", hint: "One in hundreds shines another colour. Touch it.", gives: "Shiny Scale" },
  { id: "tide", name: "Night Tide", hint: "The deep has nights of its own.", gives: "3 black pearls" },
];
function findSecret(id) {
  if (S.secrets.includes(id)) return false;
  S.secrets.push(id);
  const s = SECRETS.find(x => x.id === id);
  floatText(play.cx, play.cy - 70, "SECRET: " + s.name.toUpperCase(), C.violet, "caps", 3);
  burst(play.cx, play.cy, "#c3a0ff", 40, 110);
  if (id === "wink") findRelic("bell");
  if (id === "grotto") { findRelic("lantern"); awardBlack(5); }
  if (id === "tooth") findRelic("tooth");
  if (id === "shiny") findRelic("scale");
  if (id === "tide") awardBlack(3);
  save();
  return true;
}

// the heart winks at 7 taps in a row, each right on a beat
const wink = { streak: 0, lastBeat: -1 };
function onTap() {
  S.run.taps++;
  const early = heart.beat > M.beat - 0.25, late = heart.beat < 0.25;
  if (!early && !late) { wink.streak = 0; return; }
  const beat = heart.count + (early ? 1 : 0);
  if (beat === wink.lastBeat) return;
  wink.streak = beat === wink.lastBeat + 1 ? wink.streak + 1 : 1;
  wink.lastBeat = beat;
  if (wink.streak >= 7 && findSecret("wink")) heart.pulse = 1;
}

// a crack in the trench wall; hold the current on it and it opens
const grotto = { held: 0 };
const grottoSpot = () => { const [sx, sy] = bgShift();
  return [Math.round(play.w * 0.07) + sx, Math.round(play.top + (play.h - play.top) * 0.42) + sy]; };
function updateGrotto(dt) {
  if (Z.id !== "trench" || S.secrets.includes("grotto")) return;
  const [gx, gy] = grottoSpot();
  if (currentLive() && Math.hypot(current.x - gx, current.y - gy) < 18) {
    grotto.held += dt;
    if (grotto.held > 8) { findSecret("grotto"); burst(gx, gy, C.gold, 40, 70); }
  } else grotto.held = 0;
}
function drawGrotto() {
  if (Z.id !== "trench") return;
  const [gx, gy] = grottoSpot(), open = S.secrets.includes("grotto");
  // a jagged crack, and two faint eyes that breathe (they light up while you hold)
  const zig = [0, 1, 0, -1, -1, 0, 1, 1, 0, -1, 0, 1, 0];
  zig.forEach((d, i) => rect(gx + d, gy - 6 + i, 1, 1, "#010205"));
  const k = open ? 1 : Math.min(1, grotto.held / 8), on = Math.sin(now * 0.8) > 0.4 || k > 0;
  if (on || open) {
    const col = open || k > 0.5 ? C.gold : "#2d5d6e";
    rect(gx - 2, gy - 1, 1, 1, col); rect(gx + 2, gy - 1, 1, 1, col);
  }
}

// -------------------------------------------------------------- bestiary

// everything that can be seen: every species, and the gulper
const BEASTS = [...SPECIES.map(s => ({ id: s.id, name: s.name, desc: s.desc, icon: "i_" + s.id })),
  { id: "gulper", name: "Gulper Eel", desc: "It eats the light between things.", icon: "i_gulper" }];
function see(id, shiny = false) {
  const b = S.best[id] || (S.best[id] = { seen: false, shiny: false });
  if (b.seen && (!shiny || b.shiny)) return;
  b.seen = true;
  if (shiny) b.shiny = true;
  // every fourth creature seen is worth two black pearls
  const seen = Object.values(S.best).filter(x => x.seen).length;
  if (Math.floor(seen / 4) > S.bestPaid) { S.bestPaid = Math.floor(seen / 4); awardBlack(2); }
}
function updateBestiary() {
  for (const s of SPECIES) if ((S.owned[s.id] || 0) > 0 && !(S.best[s.id] && S.best[s.id].seen)) see(s.id);
}

// ------------------------------------------------------------------ shinies

const shinyChance = () => (tide.on ? 1 / 30 : 1 / 300);
const hasShiny = s => !!ATLAS.sprites[(s.frames ? s.frames[0] : s.spr) + "_s"];
function tapShiny(x, y) {
  const c = creatures.find(c => c.shiny && Math.hypot(c.x - x, c.y - y) < c.s.size * 0.6 + 5);
  if (!c) return false;
  c.shiny = false;
  see(c.s.id, true);
  burst(c.x, c.y, "#ffffff", 24, 70);
  floatText(c.x, c.y - 12, "CATALOGUED", C.gold, "caps");
  if (!findSecret("shiny")) awardBlack(1, c.x, c.y - 22);
  return true;
}

// -------------------------------------------------------------- night tide

const tide = { on: false, left: 0 };
const TIDE_EVERY = 2 * 3600, TIDE_LEN = 180;
function updateTide(dt) {
  S.played += dt;
  if (tide.on) { if ((tide.left -= dt) <= 0) tide.on = false; return; }
  let due;
  if (S.realtime) {
    // once a night, between midnight and five, on the local clock
    const d = new Date(), day = d.toDateString();
    due = d.getHours() < 5 && S.tideDay !== day;
    if (due) S.tideDay = day;
  } else due = S.played - S.tideAt > TIDE_EVERY;
  if (!due || descent.active) return;
  S.tideAt = S.played;
  tide.on = true; tide.left = TIDE_LEN;
  floatText(play.cx, play.cy - 58, "NIGHT TIDE", C.violet, "big", 3);
  chime(41.2, 0.1, 5, "sine");
  findSecret("tide");
}

function updateMeta(dt) {
  if (descent.active) return;
  S.run.t += dt;
  // mastering a zone is worth three black pearls
  if (Z.gate && gateMet() && !S.mech.gatePaid) {
    S.mech.gatePaid = true;
    floatText(play.cx, play.cy - 58, "THE WAY DOWN IS OPEN", C.gold, "caps", 2.4);
    awardBlack(3);
  }
  updateTide(dt);
  updateGrotto(dt);
  updateBestiary();
  checkTrials();
}
