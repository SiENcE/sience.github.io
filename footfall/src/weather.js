/* Weather: the seasons, spring tides and storms (the plan's §7).
 *
 * All of it is a pure function of the island (its seed, traits and chapter), the
 * day and the world's Weather setting (R.weather), so plan() can read it and the
 * forecast stays exact, and the HUD can show the next three days.  Calm keeps the
 * look of the seasons and drops their rules; Seasonal applies them and brings
 * storms; Wild makes storms reach further and raises the sea each winter.
 * Tides belong to the Tidal isle and come at any setting.
 */
"use strict";

const SEASONS = ["spring", "summer", "autumn", "winter"];

// the season and the day within it
function calendar(day, traits) {
  const L = traits.includes("snow") ? SEASON_LEN.snow : SEASON_LEN.usual, year = L.reduce((a, b) => a + b, 0);
  let d = (((day - 1) % year) + year) % year, s = 0;
  while (d >= L[s]) d -= L[s++];
  return { season: s, sday: d, len: L[s] };
}

const roll = (seed, day, salt) => hashInt(seed, day, salt) / 4294967296;
// a storm's chance: more in autumn and winter, on the Storm coast and when Wild
function stormRoll(isl, day) {
  if (R.weather === "calm" || (isl.chapter === 1 && day < STORM.calmDays)) return false;
  const c = calendar(day, isl.traits);
  let p = c.season >= 2 ? STORM.fall : STORM.p;
  if (isl.traits.includes("storm")) p *= STORM.stormCoast;
  if (R.weather === "wild") p *= STORM.wild;
  return roll(isl.seed, day, 0x5707) < p;
}

function weatherOf(day, isl = S) {
  const rules = R.weather !== "calm", c = calendar(day, isl.traits), next = calendar(day + 1, isl.traits);
  const storm = stormRoll(isl, day) && !stormRoll(isl, day - 1); // never two days running
  const phase = hashInt(isl.seed, 0x71de) % TIDE.every;
  return {
    day, season: c.season, sday: c.sday, len: c.len, rules,
    // the seasons' rules (Seasonal and Wild): spring trails, summer meadows, the
    // harvest, resting fields
    spring: rules && c.season === 0, summer: rules && c.season === 1, winter: rules && c.season === 3,
    harvest: rules && c.season === 2 && c.sday === HARVEST.day,
    snow: c.season === 3, // the look, at any setting
    storm,
    tide: isl.traits.includes("tidal") && (day + phase) % TIDE.every < TIDE.days,
    frozen: rules && c.season === 3 && isl.traits.includes("snow"),
    // a sea serpent lurks: one boat waits a day unless the lighthouse is lit
    serpent: rules && isl.chapter > 1 && !storm && roll(isl.seed, day, 0x5e4) < 0.06,
    // Wild: tonight winter comes, and the sea rises
    rise: R.weather === "wild" && next.season === 3 && next.sday === 0,
  };
}

// today's weather (the day about to be played), kept while nothing it hangs on changes
let wxMemo = null;
function wx() {
  const m = wxMemo;
  if (!m || m.day !== S.day || m.seed !== S.seed || m.mode !== R.weather || m.traits !== S.traits || m.ch !== S.chapter)
    wxMemo = Object.assign(weatherOf(S.day), { seed: S.seed, mode: R.weather, traits: S.traits, ch: S.chapter });
  return wxMemo;
}
// the wear at which grass turns into a trail today
const trailAt = () => (wx().spring ? SPRING_TRAIL : R.wear.trail);

// the tiles a storm floods: from the sea inland, up to FLOOD tiles deep, through
// open ground.  Cobbles and sea walls stop the water; in the Highlands only the
// low ground (height 0-1) floods
function floodTiles() {
  const deep = FLOOD[R.weather] || FLOOD.seasonal, out = new Uint8Array(N * N), H = S.height;
  let front = [];
  for (let i = 0; i < N * N; i++) if (S.ground[i] === "~" || S.ground[i] === "_") front.push(i);
  for (let d = 1; d <= deep; d++) {
    const next = [];
    for (const i of front) {
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, j = ny * N + nx;
        if (!inMap(nx, ny) || out[j] || S.ground[j] !== ".") continue;
        if (S.cob[j] === "1" || S.soil[j] === "L" || (H && +H[j] > 1) || (hearthB && hearthB.x === nx && hearthB.y === ny)) continue;
        out[j] = 1; next.push(j);
      }
    }
    front = next;
  }
  return out;
}

// Wild: the sea rises each winter.  A third of the outermost ring of shore goes
// under, a different third each year (in the Highlands the lowest ring, all of it);
// cobbles and sea walls hold it back
function risingTiles() {
  const H = S.height, ring = [];
  for (let i = 0; i < N * N; i++) {
    if (S.ground[i] !== ".") continue;
    const x = i % N, y = (i / N) | 0;
    if (!coastal(x, y) || S.cob[i] === "1" || S.soil[i] === "L" || onSquare(x, y)) continue;
    const b = bAt(x, y);
    if (b && b.t === "hearth") continue;
    ring.push(i);
  }
  if (!H) { const year = Math.floor((S.day - 1) / 40); return ring.filter(i => hashInt(S.seed, i, year, 0x415e) % 3 === 0); }
  if (!ring.length) return ring;
  const low = Math.min(...ring.map(i => +H[i]));
  return ring.filter(i => +H[i] === low);
}

// the next few days, for the strip under the HUD
const forecastDays = (n = 3) => Array.from({ length: n }, (_, k) => weatherOf(S.day + k));
