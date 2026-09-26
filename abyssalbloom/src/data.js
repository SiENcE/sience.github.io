/* Abyssal Bloom (pixel edition) — game data.
 *
 * Same economy as the HD game in ../abyssal-bloom; sizes and speeds are in
 * logical pixels of the low-resolution screen (short side ~270px).
 */
"use strict";

const params = new URLSearchParams(location.search);
const TIME_SCALE = Math.max(1, +params.get("speed") || 1); // ?speed=20 for testing

// `spr` names atlas sprites; `size` is the body diameter used for spacing
const SPECIES = [
  { id: "plankton", name: "Glowmote", desc: "A speck of living light.", cost: 15, rate: 0.3,
    glow: "#5ff6ff", spr: "plankton", size: 10, speed: 9, turn: 2.4, cap: 28, twinkle: true },
  { id: "jelly", name: "Moon Jelly", desc: "Pulses in time with the heart.", cost: 110, rate: 2,
    glow: "#9fd8ff", spr: "jelly0", frames: ["jelly0", "jelly1"], size: 20, speed: 10, turn: 0.9, cap: 18, upright: true },
  { id: "seahorse", name: "Lumen Seahorse", desc: "Anchors threads with its tail.", cost: 1200, rate: 12,
    glow: "#5dffc0", spr: "seahorse", size: 18, speed: 7, turn: 1.1, cap: 12 },
  { id: "angler", name: "Lantern Angler", desc: "Its lure lights the trench.", cost: 13000, rate: 70,
    glow: "#ff7fc8", spr: "angler", size: 32, speed: 11, turn: 0.8, cap: 9 },
  { id: "nautilus", name: "Star Nautilus", desc: "Ancient spirals of stored light.", cost: 140000, rate: 400,
    glow: "#ffc861", spr: "nautilus", size: 24, speed: 6, turn: 0.7, cap: 7 },
  { id: "manta", name: "Constellation Manta", desc: "Wings mapped with dead stars.", cost: 1.6e6, rate: 2400,
    glow: "#c08bff", spr: "manta", size: 40, speed: 13, turn: 0.5, cap: 4 },
  { id: "leviathan", name: "Abyssal Leviathan", desc: "The reef was built on its dreams.", cost: 2.2e7, rate: 15000,
    glow: "#7fa8ff", spr: "leviathan", size: 90, speed: 8, turn: 0.25, cap: 2, big: true },

  // natives: only found (and sold) in their own zone. `warm` ones drift to vents;
  // `sessile` ones never swim: they sit where they are put and hold extra threads
  { id: "shrimp", zone: "trench", name: "Ember Shrimp", desc: "Warms itself on the vents.", cost: 45, rate: 0.9,
    glow: "#ff9a52", spr: "shrimp", size: 12, speed: 12, turn: 2, cap: 20, warm: true },
  { id: "ventworm", zone: "trench", name: "Vent Worm", desc: "Roots on a vent and never lets go.", cost: 4000, rate: 30,
    glow: "#ff5a48", spr: "ventworm", size: 20, speed: 0, turn: 0, cap: 6, sessile: "vent" },
  { id: "sponge", zone: "plain", name: "Glass Sponge", desc: "A lantern of silica. Drag it where threads pass.",
    cost: 600, rate: 5, glow: "#a8f4ff", spr: "sponge", size: 22, speed: 0, turn: 0, cap: 8, sessile: "floor" },
  { id: "tripod", zone: "plain", name: "Tripod Fish", desc: "Stands on the silt, waiting for light.", cost: 30000,
    rate: 150, glow: "#c8d8ff", spr: "tripod", size: 26, speed: 5, turn: 0.6, cap: 6, floor: true },
];
SPECIES.forEach((s, i) => (s.index = i));
const SP = Object.fromEntries(SPECIES.map(s => [s.id, s]));
// what the shop sells here: the core species plus this zone's natives, cheapest first
const shopSpecies = () => SPECIES.filter(s => !s.zone || s.zone === Z.id).sort((a, b) => a.cost - b.cost);

// one-time mutations; `req` decides when they appear in the shop
const UPGRADES = [
  { id: "tendrils", name: "Sensitive Tendrils", desc: "Tapping the heart is twice as bright.",
    cost: 60, icon: "i_heart", req: s => s.total >= 30, apply: m => (m.click *= 2) },
  { id: "tendrils2", name: "Nerve Coral", desc: "Taps also release 3% of your light per second.",
    cost: 4000, icon: "i_heart", req: s => s.total >= 2000, apply: m => (m.clickRate += 0.03) },
  { id: "threads", name: "Resonant Water", desc: "Threads of light are 50% stronger.",
    cost: 900, icon: "i_pearl", req: s => s.total >= 400, apply: m => (m.link *= 1.5) },
  { id: "reach", name: "Long Threads", desc: "Creatures link from 30% further away.",
    cost: 25000, icon: "i_pearl", req: s => s.total >= 10000, apply: m => (m.range *= 1.3) },
  { id: "weave", name: "Many-Handed Weave", desc: "Each creature holds up to 4 threads.",
    cost: 400000, icon: "i_pearl", req: s => s.total >= 150000, apply: m => (m.maxLinks = 4) },
  { id: "threads2", name: "Choir of Light", desc: "Threads are twice as strong.",
    cost: 9e6, icon: "i_pearl", req: s => s.total >= 3e6, apply: m => (m.link *= 2) },
  { id: "current", name: "Deep Current", desc: "The current drains half as fast and pulls harder.",
    cost: 2500, icon: "i_spore", req: s => s.total >= 1000, apply: m => { m.drain *= 0.5; m.pull *= 1.4; } },
  { id: "echo", name: "Heart Echo", desc: "Every heartbeat taps the heart for you.",
    cost: 50000, icon: "i_heart", req: s => s.total >= 20000, apply: m => (m.echo = true) },
  { id: "spores", name: "Spore Season", desc: "Golden spores drift by twice as often.",
    cost: 120000, icon: "i_spore", req: s => s.total >= 60000, apply: m => (m.sporeRate *= 2) },
  // zone mutations, offered only in their zone
  { id: "vent2", zone: "trench", name: "Second Vent", desc: "Another vent cracks open on the trench floor.",
    cost: 5000, icon: "i_shrimp", req: s => s.total >= 2500, apply: m => (m.vents += 1) },
  { id: "ventwide", zone: "trench", name: "Wide Plumes", desc: "Vent plumes reach 40% further.",
    cost: 60000, icon: "i_shrimp", req: s => s.total >= 30000, apply: m => (m.ventR *= 1.4) },
  { id: "vent3", zone: "trench", name: "Third Vent", desc: "A third vent. The trench floor glows.",
    cost: 900000, icon: "i_ventworm", req: s => s.total >= 400000, apply: m => (m.vents += 1) },
  { id: "roots", zone: "plain", name: "Deep Roots", desc: "Anchored creatures hold 2 more threads.",
    cost: 20000, icon: "i_sponge", req: s => s.total >= 8000, apply: m => (m.anchorLinks += 2) },
  { id: "lure", zone: "plain", name: "Lantern Lure", desc: "Gulpers flee after 2 taps instead of 3.",
    cost: 80000, icon: "i_tripod", req: s => s.total >= 40000, apply: m => (m.gulperTaps = 2) },
  { id: "glasschoir", zone: "plain", name: "Glass Choir", desc: "Every anchored creature shines 3x as bright.",
    cost: 1.5e6, icon: "i_sponge", req: s => s.total >= 6e5, apply: m => (m.sp.sponge *= 3) },
  ...SPECIES.map(s => ({
    id: s.id + "2", name: s.name + " Harmony", desc: `${s.name}s shine twice as bright.`,
    cost: s.cost * 12, icon: "i_" + s.id, tier: 1, zone: s.zone,
    req: st => (st.owned[s.id] || 0) >= 10, apply: m => (m.sp[s.id] *= 2),
  })),
  ...SPECIES.map(s => ({
    id: s.id + "3", name: s.name + " Chorus", desc: `${s.name}s shine three times as bright.`,
    cost: s.cost * 300, icon: "i_" + s.id, tier: 2, zone: s.zone,
    req: st => (st.owned[s.id] || 0) >= 30, apply: m => (m.sp[s.id] *= 3),
  })),
];

// mutations on offer here: not bought yet, unlocked, and not from another zone
const upgradeHere = u => !S.upg.includes(u.id) && (!u.zone || u.zone === Z.id) && u.req(S);

const DESCEND_AT = 1e6;
const SAVE_KEY = "abyssal-bloom-pixel-v1"; // separate from the HD game's save

// world tuning, in logical pixels
const LINK_RANGE = 44;
const CURRENT_R = 110;
const HEART_R = 26;   // tap radius
const BEAT = 3.2;     // seconds between heartbeats
