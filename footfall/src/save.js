/* Saves: the profile, the list of worlds, and the worlds themselves.
 *
 *   footfall-profile-v1   lessons learned, pages read, hints, sound, zoom: shared by every world
 *   footfall-slots-v1     { last, worlds: [{ id, name, chapter, day, pop, played, n, thumb }] }
 *   footfall-world-<id>   one world: settings, chart, voyage, settled islands, the active island
 *
 * While playing, the world is W and its active island is S (the same shape as the
 * old one-island save, so the sim doesn't care); save() puts S back into W.
 * Every world carries a version, and MIGRATE brings older ones up to SAVE_VERSION
 * on load and on import.  The old one-island save (footfall-v1) becomes chapter 1
 * of a new world; its key goes once the new save is safely written.
 */
"use strict";

const KEY = { profile: "footfall-profile-v1", slots: "footfall-slots-v1", world: id => "footfall-world-" + id,
  legacy: "footfall-v1", zoom: "footfall-zoom" };
const noSave = () => params.has("demo"); // never overwrite a real village with the showcase

const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch { /* private mode */ } };
const parse = raw => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

// ---------------------------------------------------------------- profile

const freshProfile = () => ({ v: 1, learned: [], read: [], hints: true, muted: false, zoom: 0, secrets: [], cosmetics: [], bests: {} });
const hadProfile = !!lsGet(KEY.profile);
const PROFILE = Object.assign(freshProfile(), parse(lsGet(KEY.profile)));
if (!hadProfile) PROFILE.zoom = +lsGet(KEY.zoom) || 0; // zoom used to have a key of its own

function saveProfile() { if (!noSave()) lsSet(KEY.profile, JSON.stringify(PROFILE)); }
// what an old save or an imported backup knew joins the profile; its hints and
// sound settings only count when this browser had no profile yet
function mergeProfile(p) {
  for (const k of ["learned", "read", "secrets", "cosmetics"]) for (const x of p[k] || []) if (!PROFILE[k].includes(x)) PROFILE[k].push(x);
  if (!hadProfile) for (const k of ["hints", "muted"]) if (typeof p[k] === "boolean") PROFILE[k] = p[k];
  saveProfile();
}

// ------------------------------------------------------------------ slots

const SLOTS = Object.assign({ v: 1, last: null, worlds: [] }, parse(lsGet(KEY.slots)));
const saveSlots = () => lsSet(KEY.slots, JSON.stringify(SLOTS));
const slotOf = id => SLOTS.worlds.find(w => w.id === id);
const slotsByPlayed = () => SLOTS.worlds.slice().sort((a, b) => b.played - a.played);

function newWorldId() {
  let id;
  do id = Math.random().toString(36).slice(2, 7); while (id.length < 5 || slotOf(id));
  return id;
}
// the summary the WORLDS list shows, without loading the world
function slotFor(w, isl) {
  return { id: w.id, name: w.name, chapter: w.voyage.chapter, day: isl.day, pop: isl.vil.length,
    played: w.updated, n: isl.n, thumb: thumbCodes(isl), mode: w.settings.mode };
}

// ----------------------------------------------------------------- worlds

let legacyPending = false; // the old save is deleted after the first good save of its world

// makeWorld, startWorld and openWorld live in voyage.js (the tools use them too)

// a title-screen island nobody has touched isn't worth a slot
const worthKeeping = () => S.seen || S.day > 1 || S.stats.built > 0;

function worldText() {
  S.t = Date.now();
  S.wear = S.wear.map(w => Math.round(w * 100) / 100);
  W.updated = S.t; W.game = GAME_VERSION;
  return JSON.stringify({ ...W, active: S });
}

function save() {
  if (noSave() || visiting || !worthKeeping()) return false;
  if (!lsSet(KEY.world(W.id), worldText())) return false; // storage full or private mode
  const slot = slotFor(W, S), i = SLOTS.worlds.findIndex(w => w.id === W.id);
  if (i >= 0) SLOTS.worlds[i] = slot; else SLOTS.worlds.push(slot);
  SLOTS.last = W.id;
  saveSlots();
  saveProfile();
  if (legacyPending) { lsDel(KEY.legacy); legacyPending = false; }
  return true;
}

function loadWorld(id) { return worldFrom(parse(lsGet(KEY.world(id)))).world || null; }

function deleteWorld(id) {
  lsDel(KEY.world(id));
  SLOTS.worlds = SLOTS.worlds.filter(w => w.id !== id);
  if (SLOTS.last === id) SLOTS.last = slotsByPlayed()[0]?.id || null;
  saveSlots();
}

// boot: the last world played, else the old one-island save, else a new world
// (only kept once it's played)
function bootWorld() {
  for (const id of [SLOTS.last, ...slotsByPlayed().map(w => w.id)]) {
    const w = id && loadWorld(id);
    if (w) return openWorld(w);
  }
  const old = worldFrom(parse(lsGet(KEY.legacy)));
  if (old.world) {
    openWorld(old.world);
    if (old.profile) mergeProfile(old.profile);
    legacyPending = true;
    save();
    return;
  }
  startWorld({});
}

// ------------------------------------------------------- versions and checks

// MIGRATE[v] turns a version-v world into version v + 1
const MIGRATE = {
  // the old one-island save becomes chapter 1 of a world with default settings;
  // lessons, pages, hints and sound move to the profile; villagers get names
  1: d => {
    const { learned, read, hints, muted, ...isl } = d;
    for (const v of isl.vil || []) if (!v.name) v.name = villagerName(isl.seed, v.id);
    const w = makeWorld({ size: isl.n, seed: isl.seed });
    w.created = w.updated = isl.t || Date.now();
    w.active = isl;
    w.carry = { learned, read, hints, muted };
    return w;
  },
  // weather (phase 3): new map characters, heights, delayed boats and wool.  A v2
  // world needs nothing new; the version keeps older games from half-loading a v3 one
  2: d => Object.assign(d, { version: 3 }),
  // moments (phase 4): props left by events ("H", "S", "B", "X"), the festival scar,
  // secrets found, the cobble pattern, the event deck.  Older islands start without them
  3: d => Object.assign(d, { version: 4 }),
  // finale and endless (phase 5): palms and mangroves ("v", "z"), ferry lanes and the
  // strait (soil "f", "c"), pearls, letters and trade (W.islands[].trade), sailing on
  // (W.voyage.endless), the chronicle (S.hist, S.log).  Older worlds start without them
  4: d => Object.assign(d, { version: 5 }),
};

// any saved or imported world, brought up to SAVE_VERSION and checked:
// { world, profile } or { error }.  Nothing is ever half-loaded
function worldFrom(d) {
  if (!d || typeof d !== "object") return { error: "not a Footfall world" };
  let v = d.format === "footfall-world" ? d.version : d.v === 1 && typeof d.ground === "string" ? 1 : null;
  if (!Number.isInteger(v) || v < 1) return { error: "not a Footfall world" };
  if (v > SAVE_VERSION) return { error: `made by a newer Footfall (v${v})` };
  try { for (; v < SAVE_VERSION; v++) d = MIGRATE[v](d); } catch { return { error: "the file is damaged" }; }
  const profile = d.carry || null;
  delete d.carry;
  const problem = checkWorld(d);
  return problem ? { error: problem } : { world: d, profile };
}

const MAP_CHARS = { ground: /^[~.=#_]*$/, feat: /^[.opbrkhelquUjnxgadcwyHSBXvz]*$/, soil: /^[.mswWaiLfc]*$/, cob: /^[01]*$/ };
function checkWorld(w) {
  if (typeof w.id !== "string" || typeof w.name !== "string" || !w.settings || !w.voyage || !Array.isArray(w.islands) || !w.active)
    return "the file is incomplete";
  const a = w.active, n = a.n;
  if (!Number.isInteger(n) || n < 8 || n > 64) return "bad island size";
  if (!Number.isInteger(a.seed) || !Number.isInteger(a.day)) return "bad island";
  for (const k in MAP_CHARS) if (typeof a[k] !== "string" || a[k].length !== n * n || !MAP_CHARS[k].test(a[k])) return `bad ${k} map`;
  if (a.height !== undefined && (typeof a.height !== "string" || a.height.length !== n * n || !/^[0-9]*$/.test(a.height))) return "bad height map";
  if (a.scar !== undefined && (!Array.isArray(a.scar) || a.scar.some(i => !Number.isInteger(i) || i < 0 || i >= n * n))) return "bad scar";
  if (a.hist !== undefined && (!Array.isArray(a.hist) || a.hist.some(r => !Array.isArray(r)))) return "bad chronicle";
  for (const k of ["wear", "foot"])
    if (!Array.isArray(a[k]) || a[k].length !== n * n || a[k].some(x => typeof x !== "number" || !(x >= 0))) return `bad ${k}`;
  if (!Array.isArray(a.b) || a.b.some(b => !BD[b.t] || !Number.isInteger(b.id) || !(b.x >= 0 && b.x < n && b.y >= 0 && b.y < n)))
    return "bad buildings";
  if (a.b.filter(b => b.t === "hearth").length !== 1) return "no hearth";
  if (!Array.isArray(a.vil) || a.vil.some(v => !Number.isInteger(v.id) || !Number.isInteger(v.home))) return "bad villagers";
  for (const f of w.islands) { // settled islands keep their maps too (voyages)
    const m = f.frozen || {};
    for (const k of ["ground", "feat", "soil"]) if (typeof m[k] !== "string" || m[k].length !== f.n * f.n || !MAP_CHARS[k].test(m[k])) return "bad settled island";
  }
  return null;
}

// a fingerprint of an island, to check that a round trip changed nothing
const stable = o => Array.isArray(o) ? "[" + o.map(stable).join(",") + "]"
  : o && typeof o === "object" ? "{" + Object.keys(o).sort().map(k => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}"
  : JSON.stringify(o);
const islandKey = (isl = S) => stable({ ...isl, t: 0 });

// ----------------------------------------------------- export and import

const slug = s => s.toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// a file download that works from file://: a Blob behind an <a download>
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportWorld(id = W.id) {
  if (id === W.id) return download(`footfall-${slug(W.name)}-ch${W.voyage.chapter}-day${S.day}.json`, worldText());
  const s = slotOf(id), text = lsGet(KEY.world(id));
  if (s && text) download(`footfall-${slug(s.name)}-ch${s.chapter}-day${s.day}.json`, text);
}

// the profile and every world in one file
function exportBackup() {
  save();
  const worlds = SLOTS.worlds.map(s => parse(lsGet(KEY.world(s.id)))).filter(Boolean);
  const date = new Date().toISOString().slice(0, 10);
  download(`footfall-backup-${date}.json`, JSON.stringify({ format: "footfall-backup", version: SAVE_VERSION, game: GAME_VERSION,
    profile: PROFILE, worlds }));
}

// a world file, a backup, or an old one-island save.  Every world in it becomes a
// new slot: an import never overwrites.  Returns { names } or { error }
function importText(text) {
  const d = parse(text);
  const list = d && d.format === "footfall-backup" ? (d.version > SAVE_VERSION ? null : d.worlds || []) : [d];
  if (!list) return { error: `made by a newer Footfall (v${d.version})` };
  const got = list.map(worldFrom), bad = got.find(r => r.error);
  if (bad || !got.length) return bad || { error: "no worlds in the file" };
  const ids = [];
  for (const r of got) {
    const w = r.world;
    w.id = newWorldId();
    if (!lsSet(KEY.world(w.id), JSON.stringify(w))) return { error: "no room left in the browser's storage" };
    SLOTS.worlds.push(slotFor(w, w.active));
    ids.push(w.id);
    if (r.profile) mergeProfile(r.profile);
  }
  if (d.format === "footfall-backup" && d.profile) mergeProfile(d.profile);
  saveSlots();
  return { names: got.map(r => r.world.name), ids };
}

// a hidden file input: IMPORT opens the browser's file picker
const fileInput = document.createElement("input");
Object.assign(fileInput, { type: "file", accept: ".json,application/json" });
fileInput.style.display = "none";
document.body.appendChild(fileInput);
function pickFile(onText) {
  fileInput.value = "";
  fileInput.onchange = () => {
    const f = fileInput.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => onText(String(rd.result));
    rd.readAsText(f);
  };
  fileInput.click();
}

// ------------------------------------------------------------ world codes

// settings and seed in one line to share a start, e.g. FF2-M5-SEAS-RR-W-S-12345678
// (FF2X: sandbox; an F after the length: islands don't grow)
const CODE = {
  size: { 18: "S", 22: "M", 28: "L", 34: "H" }, length: { 3: "3", 5: "5", 0: "E" },
  weather: { calm: "CALM", seasonal: "SEAS", wild: "WILD" }, rivers: { none: "R0", one: "R1", two: "R2", random: "RR" },
  forest: { open: "O", wooded: "W", deep: "D" }, start: { generous: "G", standard: "S", frugal: "F" },
};
function worldCode(s) {
  return [s.mode === "sandbox" ? "FF2X" : "FF2", CODE.size[s.size] + CODE.length[s.length] + (s.grow ? "" : "F"),
    CODE.weather[s.weather], CODE.rivers[s.rivers], CODE.forest[s.forest], CODE.start[s.start], s.seed].join("-");
}
function parseWorldCode(str) {
  const p = String(str).trim().toUpperCase().split("-"), m = p.length === 7 && /^([SMLH])([35E])(F?)$/.exec(p[1]);
  if (!m || !/^FF2X?$/.test(p[0]) || !/^\d{1,9}$/.test(p[6])) return null;
  const back = (k, c) => { const e = Object.entries(CODE[k]).find(([, v]) => v === c); return e ? e[0] : null; };
  const s = { mode: p[0] === "FF2X" ? "sandbox" : "voyage", size: +back("size", m[1]), length: +back("length", m[2]), grow: !m[3],
    weather: back("weather", p[2]), rivers: back("rivers", p[3]), forest: back("forest", p[4]), start: back("start", p[5]), seed: +p[6] };
  return Object.values(s).some(v => v === null) ? null : s;
}

bootWorld();
