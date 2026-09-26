/* The rules in force: the numbers from data.js, adjusted by the world's settings
 * and by the voyage's boons and heirlooms (later also mutators).  The sim reads
 * R, never the constants, so a world can bend a rule without touching the code
 * that uses it.
 */
"use strict";

const defaultSettings = () => Object.fromEntries(SETTINGS.map(o => [o.key, o.def]));

// voyage: { boons: [id], heirlooms: [id] } (save.js's W.voyage), or nothing
function makeRules(settings = defaultSettings(), voyage = null) {
  const start = START_KIND[settings.start] || START_KIND.standard;
  const r = {
    wear: { ...WEAR },          // trail / path / cobble thresholds and the nightly decay
    step: STEP.slice(),         // cost of entering a tile, by level
    door: DOOR,
    tired: TIRED.slice(),
    costStep: start.costStep,
    start: { ...start.stock },
    arriveFood: ARRIVE_FOOD,
    hearthReach: HEARTH_REACH,
    tavernReach: TAVERN_REACH,
    tavernCheer: TAVERN_CHEER,
    wellRadius: WELL_RADIUS,
    cutterRadius: CUTTER_RADIUS,
    marketReach: MARKET_REACH,
    fisherOut: FISHER_OUT.slice(),
    stretch: { ...STRETCH },
    siteCrew: SITE_CREW,
    houseExtra: HOUSE_EXTRA,
    word: { ...WORD },
    woodKeep: WOOD_KEEP,
    goods: { ...GOODS },
    // per building kind: customers a keeper serves, and jobs (when a heirloom changes them)
    serve: Object.fromEntries(BUILDINGS.filter(b => b.serve).map(b => [b.id, b.serve])),
    jobs: {},
    // island traits: walking over rough ground (snowfields like scree), climbing in
    // the Highlands, the Storm coast's rich shoals, sheep in a flock, dunes wearing fast
    scree: 1.3, marsh: 1.6, boardwalk: 0.6, snowfield: 1.3, climb: CLIMB, stormFish: 3, flock: 3, sandWear: 1.5,
    // the Atoll's ferry lanes and pearls, the grand market's reach
    ferry: FERRY.step, pearl: { ...PEARL }, grandReach: GRAND_REACH,
    // the world's Weather setting (weather.js): calm, seasonal or wild
    weather: settings.weather || "seasonal",
    // the event deck, the merchant and the feast (events.js); off only to compare runs
    events: true,
    // what boons bend
    builderRate: 1, houseBonus: 0, fieldBonus: 0, wellCoin: 1,
  };
  for (const id of (voyage && voyage.boons) || []) { const b = BOONS.find(o => o.id === id); if (b) b.rules(r); }
  for (const id of (voyage && voyage.heirlooms) || []) { const h = HEIRLOOMS.find(o => o.id === id); if (h) h.rules(r); }
  return r;
}
let R = makeRules();
