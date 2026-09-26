/* Zones: what each depth looks, lights and sounds like.
 *
 * Six authored zones, then the Leviathan's Dream: endless zones generated from
 * the save's seed (`S.zoneSeed`), so a zone looks the same on every reload.
 * `Z` is the zone the reef is in; it changes on Descend.
 *
 * light: sun       0..1, how much of the surface still reaches down (shafts)
 *        ambient   0..16, Bayer level of darkness where nothing glows
 *        dark      colour of that darkness
 *        water     the water's own colour (the descent strip blends these)
 *        fog       the haze that far silhouettes (mid scenery, passing life) take on
 *        ray       colour of the shafts; snow = [far, near] marine snow
 *        sparks    share of the snow that is alive and flashes on a heartbeat
 *        glowBoost how far living light reaches
 *        vignette  extra rings of dithered border
 * props: scenery, [sprite, x share of the water's width, "mid" | "near", flip] (src/props.js)
 * bg: backdrop image (assets/<bg>.png); `fb` is the CSS filter that stands in
 * for it on the shared backdrop while a zone has no painting of its own.
 */
"use strict";

const ZONE_DEFS = [
  { id: "twilight", name: "Twilight Reef", depthM: 200, bg: "bg", fb: "",
    light: { sun: 1, ambient: 0, dark: "#02060e", water: "#0d3550", fog: "#0a2a42", ray: "#6fd8ff",
      snow: ["#4f8aa6", "#9fd6ee"], sparks: 0, glowBoost: 1, vignette: 0 },
    drone: [55, 82.4],
    props: [["p_kelp", 0.04, "mid"], ["p_kelp", 0.11, "mid", 1], ["p_spire", 0.95, "mid", 1],
      ["p_coral", 0.06, "near"], ["p_anemone", 0.9, "near"], ["p_coral", 0.97, "near", 1]] },
  { id: "trench", name: "Midnight Trench", depthM: 1500, bg: "bg_trench",
    fb: "hue-rotate(12deg) saturate(0.85) brightness(0.6)",
    light: { sun: 0.35, ambient: 8, dark: "#01040b", water: "#0a2238", fog: "#0e2a40", ray: "#5fb0e8",
      snow: ["#35607a", "#7fb4cc"], sparks: 0.12, glowBoost: 1.25, vignette: 1 },
    drone: [49, 73.4], mechanic: "vents",
    gate: { kind: "vents", need: 60, text: g => `vent threads  ${Math.floor(g)}/60s`,
      desc: "Hold *3 vent-lit threads* for 60 seconds in all to open the way down." },
    props: [["p_spire", 0.03, "mid"], ["p_chimney", 0.14, "mid"], ["p_spire", 0.97, "mid", 1],
      ["p_chimney", 0.86, "mid", 1], ["p_tubes", 0.08, "near"], ["p_tubes", 0.8, "near"], ["p_tubes", 0.93, "near", 1]] },
  { id: "plain", name: "Abyssal Plain", depthM: 2800, bg: "bg_plain",
    fb: "hue-rotate(28deg) saturate(0.7) brightness(0.45)",
    light: { sun: 0.06, ambient: 11, dark: "#01030a", water: "#0a1630", fog: "#101c36", ray: "#5a8ad0",
      snow: ["#2a4660", "#5d88a8"], sparks: 0.25, glowBoost: 1.45, vignette: 1 },
    drone: [41.2, 61.7], mechanic: "gulper",
    gate: { kind: "gulpers", need: 3, text: g => `gulpers driven off  ${g}/3`,
      desc: "Drive off *3 Gulpers*. Tap one three times as it passes." },
    props: [["p_arch", 0.13, "mid"], ["p_sponge", 0.05, "near"], ["p_seapen", 0.2, "near"],
      ["p_seapen", 0.87, "near", 1], ["p_sponge", 0.96, "near", 1]] },
  { id: "hadal", name: "Hadal Gardens", depthM: 4100, bg: "bg_hadal",
    fb: "hue-rotate(60deg) saturate(1.1) brightness(0.45)",
    light: { sun: 0, ambient: 11, dark: "#03020c", water: "#170f33", fog: "#22164a", ray: "#8a6ad0",
      snow: ["#3a2d60", "#8a70c0"], sparks: 0.4, glowBoost: 1.6, vignette: 2 },
    drone: [36.7, 55],
    props: [["p_spire", 0.02, "mid"], ["p_kelp", 0.97, "mid", 1], ["p_fan", 0.05, "near"], ["p_coral", 0.17, "near"],
      ["p_anemone", 0.3, "near"], ["p_shroom", 0.74, "near"], ["p_coral", 0.86, "near", 1], ["p_fan", 0.96, "near", 1]] },
  { id: "choir", name: "The Drowned Choir", depthM: 5400, bg: "bg_choir",
    fb: "hue-rotate(95deg) saturate(0.8) brightness(0.38)",
    light: { sun: 0, ambient: 12, dark: "#04020a", water: "#140d2a", fog: "#1c1638", ray: "#7a8ad0",
      snow: ["#2d3050", "#7078a8"], sparks: 0.3, glowBoost: 1.75, vignette: 2 },
    drone: [32.7, 49],
    props: [["p_ribs", 0.06, "mid"], ["p_column", 0.2, "mid"], ["p_column", 0.8, "mid", 1], ["p_ribs", 0.94, "mid", 1],
      ["p_crystal", 0.08, "near"], ["p_crystal", 0.92, "near", 1]] },
  { id: "heart", name: "Heart of the Deep", depthM: 6700, bg: "bg_heart",
    fb: "hue-rotate(130deg) saturate(0.9) brightness(0.3)",
    light: { sun: 0, ambient: 13, dark: "#050108", water: "#1c0818", fog: "#260c22", ray: "#d06a9a",
      snow: ["#402030", "#a06080"], sparks: 0.45, glowBoost: 1.9, vignette: 3 },
    drone: [27.5, 41.2],
    props: [["p_spire", 0.03, "mid"], ["p_spire", 0.97, "mid", 1], ["p_roots", 0.08, "near"],
      ["p_shroom", 0.22, "near"], ["p_crystal", 0.8, "near"], ["p_roots", 0.93, "near", 1]] },
];

// ---------------------------------------------------------- the dream

// small, fast, good enough: mulberry32 over a hash of (seed, depth)
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
const hash2 = (a, b) => (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)) >>> 0;
const pick = (r, list) => list[Math.floor(r() * list.length)];

const DREAM_ADJ = ["Weeping", "Hollow", "Drowned", "Glass", "Sleeping", "Silent", "Burning", "Inverted",
  "Forgotten", "Velvet", "Shivering", "Sunless", "Echoing", "Pale", "Dreaming", "Folded", "Salt"];
const DREAM_PLACE = ["Shelf", "Choir", "Lanterns", "Orchard", "Cathedral", "Gardens", "Hollows", "Spires",
  "Tide", "Nursery", "Archive", "Cradle", "Mirror", "Vaults", "Rift", "Stair", "Lung"];
// hand-picked so a dream never lands on a colour that fights the glow palette:
// [water, dark, ray, snow far, snow near, hue shift of the borrowed backdrop]
const DREAM_PALETTES = [
  ["#1a0d2e", "#04020a", "#b07aff", "#3a2860", "#a88ae0", 40],
  ["#0a2226", "#010606", "#5fffd0", "#1f4a48", "#7fe0c8", -40],
  ["#2a0c1c", "#060106", "#ff7fb0", "#50203a", "#e08ab0", 150],
  ["#221a08", "#060401", "#ffc861", "#4a3a18", "#e0c080", 200],
  ["#0c1430", "#01020a", "#7fa8ff", "#243060", "#90a8e8", 0],
  ["#08241a", "#010604", "#8aff9a", "#1c4a30", "#9ae0a8", -80],
];
const PENT_STEPS = [0, 3, 5, 7, 10];
const MID_PROPS = ["p_spire", "p_kelp", "p_arch", "p_chimney", "p_ribs", "p_column"];
const NEAR_PROPS = ["p_coral", "p_tubes", "p_seapen", "p_sponge", "p_fan", "p_anemone", "p_crystal", "p_roots", "p_shroom"];

// scenery for a dream: a few of everything, kept to the edges so the middle stays open
function dreamProps(r) {
  const edge = () => (r() < 0.5 ? r() * 0.22 : 1 - r() * 0.22);
  const out = [];
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) out.push([pick(r, MID_PROPS), edge(), "mid", r() < 0.5 ? 1 : 0]);
  for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) out.push([pick(r, NEAR_PROPS), edge(), "near", r() < 0.5 ? 1 : 0]);
  return out;
}

function genZone(depth) {
  const seed = +params.get("seed") || S.zoneSeed || 1;
  const r = rng(hash2(seed, depth));
  const [water, dark, ray, s0, s1, hue] = pick(r, DREAM_PALETTES);
  const from = ZONE_DEFS[1 + Math.floor(r() * (ZONE_DEFS.length - 1))];
  const note = 27.5 * Math.pow(2, pick(r, PENT_STEPS) / 12);
  return {
    id: "dream" + depth, dream: true, depthM: 6700 + (depth - ZONE_DEFS.length + 1) * 1100,
    name: "The " + pick(r, DREAM_ADJ) + " " + pick(r, DREAM_PLACE),
    // a borrowed painting, re-tinted and maybe mirrored: the dream remixes the reef
    bg: from.bg, flip: r() < 0.5,
    tint: `hue-rotate(${hue + Math.round((r() - 0.5) * 30)}deg) saturate(${(0.8 + r() * 0.5).toFixed(2)}) ` +
      `brightness(${(0.55 + r() * 0.2).toFixed(2)})`,
    fb: from.fb,
    light: { sun: 0, ambient: 11 + Math.floor(r() * 3), dark, water, fog: s0, ray, snow: [s0, s1],
      sparks: 0.3 + r() * 0.25, glowBoost: 1.6 + r() * 0.6, vignette: 3 },
    drone: [note, note * 1.498],
    props: dreamProps(r),
  };
}

const zoneDef = depth => (depth < ZONE_DEFS.length ? ZONE_DEFS[depth] : genZone(depth));
let Z = null; // set by setZone() once the save is loaded
function setZone() { Z = zoneDef(S.depth); }
setZone();
