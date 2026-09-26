/* Save state and the economy — ported unchanged from the HD game. */
"use strict";

function freshState() {
  return {
    lumen: 0, total: 0, allTime: 0, pearls: 0, depth: 0,
    owned: {}, upg: [], t: Date.now(), res: 1, muted: false, clicks: 0,
    learned: [], read: [], hints: true, spores: 0, // tutorial lessons done, codex pages seen
    zoneSeed: 1 + Math.floor(Math.random() * 2147483646), // shapes this save's dream zones
    gate: 0, // progress on this zone's gate; reset on every descent
    mech: {}, // this zone's mechanic state that should survive a reload (anchor spots…)
    // the Depth Log (src/meta.js): all of it survives Descend
    black: 0, tree: [], relics: [], equip: [], trials: [], secrets: [], best: {}, bestPaid: 0,
    stats: { eaten: 0 }, run: { t: 0, taps: 0, spores: 0, cleanGulper: false },
    realtime: false, played: 0, tideAt: 0, tideDay: "", logOpened: false,
  };
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? Object.assign(freshState(), JSON.parse(raw)) : null;
  } catch { return null; }
}
let S = load() || freshState();

function save() {
  if (params.has("demo")) return; // never overwrite a real reef with the showcase
  S.t = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* private mode */ }
}

// derived modifiers, rebuilt whenever upgrades change
let M;
function rebuildMods() {
  M = { click: 1, clickRate: 0.01, link: 0.035, range: 1, maxLinks: 3, drain: 30, pull: 1,
    echo: false, sporeRate: 1, sp: Object.fromEntries(SPECIES.map(s => [s.id, 1])),
    vents: 1, ventR: 1, anchorLinks: 2, gulperTaps: 3 };
  if (typeof applyMeta === "function") applyMeta(M); // the tree and relics (meta.js loads later)
  else Object.assign(M, { chargeMult: 2, resExp: 0.85, all: 1, pearlPct: 0.1, currentReach: 1.4 });
  for (const id of S.upg) UPGRADES.find(u => u.id === id)?.apply(M);
}
rebuildMods();

const costOf = (s, owned) => s.cost * Math.pow(1.15, owned);
function bulkCost(s, n) {
  return costOf(s, S.owned[s.id] || 0) * (Math.pow(1.15, n) - 1) / 0.15;
}
function maxAffordable(s) {
  const c0 = costOf(s, S.owned[s.id] || 0);
  return Math.max(0, Math.floor(Math.log(S.lumen * 0.15 / c0 + 1) / Math.log(1.15)));
}

const pearlMult = () => 1 + M.pearlPct * S.pearls;
function baseRate() {
  let r = 0;
  for (const s of SPECIES) r += (S.owned[s.id] || 0) * s.rate * M.sp[s.id];
  return r * pearlMult() * M.all;
}
let now = 0; // seconds since boot, real time
let resonance = 1, linkCount = 0, charged = 0, frenzyUntil = 0;
const frenzyMult = () => (now < frenzyUntil ? 7 : 1);
const rate = () => baseRate() * resonance * frenzyMult();
const clickValue = () => (M.click + rate() * M.clickRate) * pearlMult();

function gain(n) { S.lumen += n; S.total += n; S.allTime += n; }
// pearls are never spent, so the ones held are the ones already earned
const pearlsAvailable = () => Math.floor(Math.sqrt(S.allTime / DESCEND_AT)) - S.pearls;

const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function fmt(n) {
  n += 1e-9 * Math.max(1, n); // 14.999999 from the cost formula is 15
  if (n < 1000) return n < 10 && n % 1 > 0.05 ? n.toFixed(1) : Math.floor(n).toString();
  const e = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, e);
  if (n >= 1000 * Math.pow(1000, SUFFIX.length - 1)) { // past the names: 1.23e45
    const x = Math.floor(Math.log10(n));
    return (n / Math.pow(10, x)).toFixed(2) + "e" + x;
  }
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)) + SUFFIX[e];
}
function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${Math.floor(sec % 60)}s` : `${Math.floor(sec)}s`;
}
