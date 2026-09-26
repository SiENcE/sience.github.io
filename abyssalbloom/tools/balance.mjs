// Economy simulator: how long does each dive take?     node tools/balance.mjs [options]
//
// Loads the game's own data.js, state.js and zones.js into a Node vm (they are
// plain scripts that share globals), then plays a scripted player second by
// second: tapping, buying the best payback, buying every mutation it can afford,
// catching most spores and descending by a fixed rule. The web of threads is not
// simulated; its size is estimated from how many creatures of how many species
// are on screen, and zone gates are assumed met. Judge economy changes by the
// table this prints, not by feel.
//
//   --runs=12     dives to play
//   --cps=2       taps per second (0 = a player who never taps)
//   --wait=0.6    descend once the next dive would add this share of the pearls held
//   --hold=0.25   share of the time the current is held
//   --catch=0.8   share of spores caught
import vm from "node:vm";
import { readFileSync } from "node:fs";

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, +v]));
const RUNS = opt.runs ?? 12, CPS = opt.cps ?? 2, WAIT = opt.wait ?? 0.6, HOLD = opt.hold ?? 0.25, CATCH = opt.catch ?? 0.8;

const game = vm.createContext({
  location: { search: "" }, URLSearchParams, Math, Date, console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
for (const f of ["src/data.js", "src/state.js", "src/zones.js"]) {
  vm.runInContext(readFileSync(f, "utf8"), game, { filename: f });
}
const g = code => vm.runInContext(code, game);
const { SPECIES, UPGRADES } = g("({ SPECIES, UPGRADES })");
const S = () => g("S"), M = () => g("M");

// threads the reef would hold: every creature on screen links to up to
// maxLinks others of a different species, and longer reach fills more slots
function threadEstimate() {
  const s = S(), m = M();
  const shown = SPECIES.map(sp => Math.min(s.owned[sp.id] || 0, sp.cap));
  const n = shown.reduce((a, b) => a + b, 0), most = Math.max(0, ...shown);
  if (n < 2 || most === n) return 0;
  const slots = Math.min(n * m.maxLinks / 2, (n - most) * m.maxLinks);
  return slots * Math.min(0.9, 0.6 * m.range);
}

function resonanceNow() {
  const t = threadEstimate(), m = M();
  const charged = t * 0.4 * HOLD * (m.drain < 30 ? 1.5 : 1);
  return 1 + m.link * Math.pow(t + charged, 0.85);
}

function step(dt, frenzy) {
  const res = resonanceNow();
  const rate = g("baseRate()") * res * frenzy;
  const click = CPS * (M().click + rate * M().clickRate) * g("pearlMult()");
  g(`gain(${(rate + click) * dt})`);
  return rate;
}

// buy mutations first (they are one-time and strong), then the creature with the
// best payback; a species not yet on the reef counts double, for the threads it adds
function shop() {
  for (;;) {
    const s = S();
    const u = UPGRADES.filter(u => g("upgradeHere")(u) && s.lumen >= u.cost).sort((a, b) => a.cost - b.cost)[0];
    if (u) { g(`S.lumen -= ${u.cost}; S.upg.push(${JSON.stringify(u.id)}); rebuildMods();`); continue; }
    let best = null, bestScore = 0;
    for (const sp of g("shopSpecies()")) {
      const owned = s.owned[sp.id] || 0, cost = g(`costOf(SP.${sp.id}, ${owned})`);
      if (cost > s.lumen) continue;
      const score = (sp.rate * M().sp[sp.id] * (owned ? 1 : 2)) / cost;
      if (score > bestScore) { bestScore = score; best = { sp, cost }; }
    }
    if (!best) return;
    g(`S.lumen -= ${best.cost}; S.owned.${best.sp.id} = (S.owned.${best.sp.id} || 0) + 1;`);
  }
}

const fmtT = sec => { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(Math.floor(sec % 60)).padStart(2, "0")}s`; };
const pad = (s, n) => String(s).padEnd(n);

g("S = freshState(); rebuildMods(); setZone();");
console.log(`taps ${CPS}/s, current held ${HOLD * 100}%, spores caught ${CATCH * 100}%, descend at +${WAIT * 100}% pearls\n`);
console.log(pad("dive", 5) + pad("zone", 26) + pad("time", 10) + pad("total", 10) + pad("pearls", 14) + "lumen/s at the end");
let total = 0;
for (let run = 0; run < RUNS; run++) {
  let t = 0, frenzyLeft = 0, nextSpore = 45, rate = 0;
  const cap = 12 * 3600;
  for (; t < cap; t++) {
    rate = step(1, frenzyLeft > 0 ? 7 : 1);
    frenzyLeft--;
    if (t >= nextSpore) {
      nextSpore = t + 80 / M().sporeRate;
      if (Math.random() < CATCH) {
        if (Math.random() < 0.55) frenzyLeft = 20;
        else g(`gain(${Math.max(25, rate * 90)})`);
      }
    }
    if (t % 5 === 0) shop();
    // gates are not played out; they are taken as met once there is a pearl to take
    const pa = g("pearlsAvailable()");
    if (pa >= Math.max(1, Math.ceil(S().pearls * WAIT))) break;
  }
  total += t;
  const pa = g("pearlsAvailable()"), zone = g("Z.name");
  console.log(pad(run + 1, 5) + pad(zone, 26) + pad(fmtT(t), 10) + pad(fmtT(total), 10) +
    pad(`${S().pearls} -> ${S().pearls + pa}`, 14) + g(`fmt(${rate})`) + (t >= cap ? "  (gave up)" : ""));
  g(`S.pearls += pearlsAvailable(); S.depth++; S.lumen = 0; S.total = 0; S.owned = {}; S.upg = []; rebuildMods(); setZone();`);
}
