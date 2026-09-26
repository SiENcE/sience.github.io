/* Rules and balance: buildings, costs, milestones, and the numbers behind paths.
 * Everything a designer might want to tune lives here. */
"use strict";

const GAME_VERSION = "0.4.0";
const SAVE_VERSION = 5;  // the world format (save.js); older worlds are migrated on load
const params = new URLSearchParams(location.search);
const TIME_SCALE = Math.max(0.1, +params.get("speed") || 1); // day playback speed

const ISLAND_N = 22;    // new islands are ISLAND_N x ISLAND_N tiles
let N = ISLAND_N;       // this island's size: a saved island keeps the size it was made with
const TW = 32, TH = 16; // isometric tile size in logical pixels

// Desire paths.  Every step onto a tile adds 1 wear; each night wear decays
// (wear = wear * decay + today's steps).  The level decides the walking cost.
const WEAR = { trail: 2, path: 6, cobble: 14, decay: 0.8 };
const LEVELS = ["grass", "trail", "path", "cobbles"];
const STEP = [1, 0.8, 0.6, 0.4]; // cost of entering a tile, by level
const DOOR = 0.5;                // cost of stepping into the destination building

// A long walk to work tires the worker: commute above TIRED[0] -> -1 output,
// above TIRED[1] -> -2.
const TIRED = [6, 10];

// every copy of a building costs a bit more: base + floor(owned * base / COST_STEP)
const COST_STEP = 8;

const ARRIVE_FOOD = 3;     // a newcomer needs this much spare food to settle
const HEARTH_REACH = 10;   // after work, villagers this close (walk cost) gather at the hearth
const TAVERN_REACH = 6;    // ...or at a tavern this close instead
const TAVERN_CHEER = 3;    // this many tavern guests invite one extra newcomer
const WELL_RADIUS = 2;     // cottages this close to a well get one more bed
                           // cottages beside cobbles get one more bed too ("street-front")
const CUTTER_RADIUS = 2;   // woodcutters count trees this close
const MARKET_REACH = 1;    // markets count villagers passing this close (8 neighbours)

// place: land (plain grass), coast (grass beside the sea), water (a river tile),
// tree (plants a tree on grass), cottage (an upgrade, built on a cottage),
// cobble (street furniture: stands on a cobbled tile and doesn't block it),
// marsh (a boardwalk over a marsh tile), pave (stone laid on open ground),
// sea (open water beside the land: reclaimed), strait (the Twin isles' channel: a long bridge).
// trait: only on islands with that trait (voyage.js), or where its goods came by boat
// door: entered only from its two front sides (+x, +y; any side when both are blocked),
// so paths lead up to the door and round the back of the house.
// jobs: how many workers it takes.  labour: a big project, raised as a building
// site by the villagers left without a job (builder-days).  group: its category
// in the build bar (a category with 2+ buildings unlocked shows as one card)
const BUILDINGS = [
  { id: "cottage", door: true, name: "Cottage", cost: { wood: 4 }, beds: 2, group: "homes", tier: 0, place: "land",
    desc: "A home for *2 villagers*, *+1* beside cobbles. Newcomers only arrive when there is a free bed." },
  { id: "house", door: true, name: "House", cost: { wood: 10, coin: 20 }, beds: 4, group: "homes", tier: 4, place: "cottage", labour: 1,
    desc: "Rebuilds a cottage with *2 more beds*, open while its people *pass a market* (and there are goods) and *meet in the evening*." },
  { id: "field", name: "Field", cost: { wood: 2 }, jobs: 2, group: "food", tier: 0, place: "land", res: "food",
    desc: "*2 food* a day, *+2 on a meadow*, *+1 for each field* beside it (up to +2); a second worker adds *+1*." },
  { id: "woodcutter", door: true, name: "Woodcutter", cost: { wood: 3 }, jobs: 2, group: "craft", tier: 0, place: "land", res: "wood",
    desc: "*1 wood for every 2 trees* within 2 tiles (up to 4); a second worker adds *half* as much." },
  { id: "fisher", door: true, name: "Fisher", cost: { wood: 3 }, jobs: 2, group: "food", tier: 1, place: "coast", res: "food",
    desc: "*3 food*, *+1* with a second worker. Each stretch of coast holds *6 fish* a day, shared by its fishers." },
  { id: "market", name: "Market", cost: { wood: 5 }, jobs: 5, group: "trade", tier: 2, place: "land", res: "coin", serve: 8,
    desc: "*1 coin for every villager* who walks past it. A keeper serves *8*; it takes on keepers as trade grows, up to 5." },
  { id: "bridge", name: "Bridge", cost: { wood: 4 }, group: "land", tier: 1, place: "water",
    desc: "Lets villagers *cross the river*." },
  { id: "grove", name: "Tree", cost: { wood: 1 }, group: "land", tier: 3, place: "tree",
    desc: "Plant a tree. Trees *feed woodcutters* and *block walking*, so they steer paths." },
  { id: "workshop", door: true, name: "Workshop", cost: { wood: 8, coin: 4 }, jobs: 4, group: "craft", tier: 3, place: "land", res: "goods", labour: 2,
    desc: "Each worker turns *1 wood into 3 goods*. Houses use goods: *1 per resident* a night." },
  { id: "well", name: "Well", cost: { wood: 2, coin: 4 }, group: "homes", tier: 4, place: "land",
    desc: "Every home within 2 tiles gets *+1 bed*." },
  { id: "tavern", door: true, name: "Tavern", cost: { wood: 6, coin: 6 }, jobs: 6, group: "trade", tier: 5, place: "land", res: "coin", serve: 5,
    desc: "Workers within a short walk stop by after work: *1 coin each*, *5 per keeper*. *3 guests* invite an extra newcomer." },
  { id: "lighthouse", name: "Lighthouse", cost: { wood: 20, coin: 20 }, jobs: 1, group: "sea", tier: 6, place: "coast", unique: true, labour: 6,
    desc: "While its keeper tends the lamp, it guides *one extra newcomer* home every night." },
  // the voyage: the ship that sails on, the harbour where tribute boats unload
  { id: "ship", name: "Ship", cost: { wood: 20, coin: 200 }, group: "sea", tier: 99, place: "coast", unique: true, labour: 12,
    desc: "The ship to the next island. Unlocked by the island's goal; the builders take longer each chapter. When it is ready, *SAIL* when you like." },
  { id: "harbour", name: "Harbour", cost: { wood: 20, coin: 30 }, jobs: 4, group: "sea", tier: 99, place: "coast", unique: true, labour: 6,
    desc: "Tribute boats from your settled islands unload here: its *dockers* land the whole load. Without it only a third comes ashore." },
  // the late game (after an island's goal, and on the Great isle from the start): the town
  // hall, and what it brings: the grand market and land won back from the sea
  { id: "townhall", door: true, name: "Town hall", cost: { wood: 30, coin: 300 }, jobs: 2, group: "trade", tier: 98, place: "land", unique: true, labour: 16,
    desc: "While its clerks work, *one more newcomer* comes every night. It brings the *grand market* and *reclaiming land* from the sea. It costs more on each island." },
  { id: "grandmarket", name: "Grand market", cost: { wood: 20, coin: 120 }, jobs: 8, serve: 10, group: "trade", tier: 98, place: "land", res: "coin", labour: 6,
    desc: "A market hall: *1 coin* for every villager passing within *2 tiles*, 10 per keeper, up to 8. Those who pass it have *met in the evening* too." },
  { id: "reclaim", name: "Reclaim land", cost: { coin: 40, wood: 2 }, group: "land", tier: 98, place: "sea",
    desc: "Dike and fill a tile of sea beside the shore: *new land* to build on. Each costs a little more." },
  // island traits: their buildings
  { id: "quarry", name: "Quarry", cost: { wood: 6 }, jobs: 2, group: "craft", tier: 0, trait: "stony", place: "land", res: "stone",
    desc: "*1 stone* for each rock beside it (up to 3); a second worker adds half. Stone *paves* streets." },
  { id: "claypit", name: "Clay pit", cost: { wood: 5 }, jobs: 2, group: "craft", tier: 0, trait: "marsh", place: "land", res: "clay",
    desc: "*1 clay* for each marsh tile beside it (up to 3); a second worker adds half. Workshops turn clay into goods before wood." },
  { id: "boardwalk", name: "Boardwalk", cost: { wood: 1 }, group: "land", tier: 0, trait: "marsh", place: "marsh",
    desc: "Planks over the marsh: walking there costs *0.6* instead of *1.6*." },
  { id: "pave", name: "Paving", cost: { stone: 2 }, group: "land", tier: 0, trait: "stony", place: "pave",
    desc: "Lays stone on open ground: *cobbles at once*, for good." },
  { id: "shepherd", door: true, name: "Shepherd", cost: { wood: 5 }, jobs: 1, group: "craft", tier: 0, trait: "highlands", place: "land", res: "wool",
    desc: "A shepherd and *3 sheep*: *1 wool for every 2 open grass tiles* within 2 (up to 3). The flock grazes and tramples *trails*." },
  { id: "lodge", door: true, name: "Lodge", cost: { wood: 8 }, jobs: 2, group: "food", tier: 0, trait: "snow", place: "land", res: "food",
    desc: "Hunters bring *2 food* each, *3 in winter*. Homes within 2 tiles are warm: *+1 bed*." },
  { id: "pier", name: "Tide pier", cost: { wood: 6 }, jobs: 2, group: "sea", tier: 0, trait: "tidal", place: "coast", res: "coin",
    desc: "Its gatherers comb the flats: *1 coin for each sandbar tile* within 2 (up to 4), *twice* while a spring tide is out." },
  { id: "causeway", name: "Causeway", cost: { wood: 2 }, group: "land", tier: 0, trait: "tidal", place: "sandbar",
    desc: "Planks over a sandbar: it can be walked at *any tide*." },
  { id: "seawall", name: "Sea wall", cost: { wood: 2, coin: 2 }, group: "land", tier: 0, trait: "storm", place: "shore",
    desc: "A stone wall along the shore. Storm floods *stop* here, as at cobbles; villagers walk along its top." },
  { id: "ferry", name: "Ferry pier", cost: { wood: 8 }, jobs: 2, group: "sea", tier: 0, trait: "atoll", place: "coast", res: "pearl",
    desc: "A jetty with a ferry *straight across the water* to the shore opposite: villagers cross for *0.5* a tile. Its divers bring up *pearls*, which markets sell." },
  { id: "longbridge", name: "Long bridge", cost: { wood: 3, coin: 2 }, group: "land", tier: 0, trait: "twin", place: "strait",
    desc: "A bridge over the strait between the twin isles, one tile at a time." },
  { id: "stall", name: "Stall", cost: { wood: 2, coin: 6 }, tier: 5, place: "cobble", deco: "s", group: "street", res: "coin",
    desc: "A street stall on cobbles: *1 coin for every 3 steps* on its tile, up to 4. No worker." },
  { id: "bench", name: "Bench", cost: { wood: 2, coin: 3 }, tier: 5, place: "cobble", deco: "b", group: "street",
    desc: "Villagers who pass it on the way home have *met in the evening*, as at the tavern." },
  { id: "lamp", name: "Lamp", cost: { coin: 5 }, tier: 6, place: "cobble", deco: "l", group: "street",
    desc: "Lights the street at night." },
  { id: "flowers", name: "Flower bed", cost: { coin: 3 }, tier: 6, place: "cobble", deco: "f", group: "street",
    desc: "Flowers along the street, for the pleasure of it." },
];
const BD = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
BD.hearth = { id: "hearth", name: "Hearth", cost: {}, tier: 99, place: "land",
  desc: "The heart of the village. Villagers without work gather here." };
// the street furniture, by its character in S.deco
const DECO = Object.fromEntries(BUILDINGS.filter(b => b.deco).map(b => [b.deco, b]));
// the build bar's categories, in bar order (lighthouse: a card of its own)
const GROUPS = {
  homes: { name: "Homes", icon: "c_cottage", desc: "Cottages, houses and wells: beds for newcomers." },
  food: { name: "Food", icon: "c_fisher", desc: "Fields and fishers feed the village." },
  craft: { name: "Crafts", icon: "c_woodcutter", desc: "Wood from the woodcutters, goods from the workshops, and each island's own trade." },
  trade: { name: "Trade", icon: "c_market", desc: "Markets, taverns and the town hall earn coins from the feet that pass." },
  land: { name: "Land", icon: "c_tree", desc: "Bridges over the rivers, trees to steer the paths, boardwalks, paving and land won from the sea." },
  sea: { name: "Sea", icon: "c_lighthouse", desc: "The lighthouse, the harbour, the ferry and the ship." },
  street: { name: "Street", icon: "c_stall", desc: "Things for cobbled streets: stalls, benches, lamps and flowers. They don't block the way." },
};

// the population goals; each one unlocks the next tier of buildings
const MILESTONES = [
  { pop: 4, unlock: ["fisher", "bridge"] },
  { pop: 7, unlock: ["market"] },
  { pop: 10, unlock: ["grove", "workshop"] },
  { pop: 14, unlock: ["well", "house"] },
  { pop: 20, unlock: ["tavern", "stall", "bench"] },
  { pop: 28, unlock: ["lighthouse", "lamp", "flowers"] },
  { pop: 40, unlock: [], festival: true },
];
// what a milestone plate calls its unlocks: street furniture as one word
const unlockNames = m => [...new Set(m.unlock.map(u => (BD[u].deco ? GROUPS.street.name : BD[u].name).toUpperCase()))];

// what each extra worker adds (field: one worker).  Fishers share their stretch of coast
const FISHER_OUT = [3, 1];
const STRETCH = { len: 6, fish: 6 }; // shore tiles per stretch, fish a stretch holds a day
const SITE_CREW = 4;                 // builders one site can use at once
const HOUSE_EXTRA = 2;               // a house's beds that need its needs met
const WORD = { pop: 28, share: 0.85 };  // "word spreads": +1 newcomer when this share worked
const WOOD_KEEP = 10;                // workshops leave this much wood in store
const GOODS = { perWood: 3, perResident: 1 }; // a workshop hand's goods from 1 wood (or clay); a house's use a night

let now = 0; // seconds since boot, real time

const START = { food: 5, wood: 12, coin: 0, goods: 0, stone: 0, clay: 0, wool: 0, pearl: 0 };
const RES = ["food", "wood", "coin", "goods", "stone", "clay", "wool", "pearl"];
// markets sell the Atoll's pearls: one for every `per` passers-by, `price` coins each
const PEARL = { per: 4, price: 3 };
// the Atoll's ferry: a lane straight across the water, up to `reach` tiles; a tile of it costs `step` to cross
const FERRY = { reach: 14, step: 0.5 };
// the grand market reaches this far (the market: R.marketReach)
const GRAND_REACH = 2;
// the chronicle (stats.js): a row a day in S.hist, the notable things in S.log
const HIST_KEYS = ["day", "pop", "beds", "food", "wood", "coin", "goods", "idle", "cob", "path", "trail"];
const HIST_MAX = 600, LOG_MAX = 300;

// ------------------------------------------------------------------ voyages

// the goal of each chapter (villagers); the first is chapter 1's festival.
// Endless voyages add 25 a chapter after the last
const CHAPTER_GOAL = [40, 60, 80, 100, 150];
const chapterGoal = ch => CHAPTER_GOAL[ch - 1] || CHAPTER_GOAL[CHAPTER_GOAL.length - 1] + 25 * (ch - CHAPTER_GOAL.length);
const SHIP_LABOUR = ch => 12 + 6 * (ch - 1);          // builder-days, growing per chapter
const CREW = { base: 4, per: 15, max: 16 };           // crew = base + floor(peak / per), up to max
const TRIBUTE_EVERY = 5;                              // days between tribute boats from one island
const ISLAND_MAX = 40;                                // islands grow by 2 a chapter, up to this
const GREAT = { bonus: 2, mix: 3 };                   // the Great isle: 2 tiles more, up to 3 of the traits played
// letters from the settled islands: now and then one asks for something (every `every`
// days per island, a chance `p`, open for `days`); the next tribute boat from it takes
// it home from the harbour, and its trade grows a level: tribute x (1 + `grow` a level), up to `top` levels
const LETTER = { every: 8, p: 0.7, days: 16, base: 12, per: 6, coin: 60, perCoin: 40, grow: 0.5, top: 6 };

// each island has one or two traits: a mechanic, a specialty and at most two buildings
const TRAITS = {
  meadow: { name: "Meadowland", good: "food", desc: "Today's island: fields, woods and the sea." },
  stony: { name: "Stony isle", good: "stone", desc: "Rocks everywhere, and *scree* that costs 1.3 to cross until it is trodden in. *Quarries* cut stone; stone *paves* streets at once." },
  marsh: { name: "Marsh isle", good: "clay", desc: "*Marsh* costs 1.6 to walk; *boardwalks* make it 0.6. *Clay pits* dig clay, which workshops turn into goods." },
  ruins: { name: "Ruin isle", good: "coin", desc: "*Ghost paths* of an older village never grow back. Cobble the tiles beside a *ruin* to restore it: a relic, and coins." },
  highlands: { name: "Highlands", good: "wool", desc: "Hills and cliffs: every step *uphill* costs more, so paths *switchback*. *Shepherds* keep sheep for wool; the flock tramples trails." },
  tidal: { name: "Tidal isle", good: "coin", desc: "Every 12 days a *spring tide* bares the sandbars for 3 days, and the *islets* can be walked to. *Causeways* keep a way open; *tide piers* comb the flats." },
  storm: { name: "Storm coast", good: "food", desc: "*Storms* come twice as often and flood the shore; *cobbles* and *sea walls* stop the water. Rich shoals: a stretch of coast holds *9 fish*." },
  snow: { name: "Snow north", good: "wood", desc: "A *long winter* of 16 days: fields rest and the rivers *freeze* over. Snowfields cost 1.3 until trodden. *Lodges* hunt, and warm the homes near them." },
  atoll: { name: "Atoll", good: "pearl", desc: "A ring of sand round a *lagoon*, palms and mangroves. A *ferry pier* runs a ferry straight across the water; its divers bring up *pearls*." },
  twin: { name: "Twin isles", good: "coin", desc: "Two islands across a *strait*: a sandbar ford at a spring tide, or *long bridges* over the water, tile by tile." },
  great: { name: "Great isle", good: "coin", desc: "The voyage's last and largest island, with a little of every island before it. The *town hall* stands ready from the first day; its goal is the *Grand Festival*." },
};
// the traits a voyage can offer, in no particular order (the world seed shuffles them)
const TRAIT_ORDER = ["stony", "marsh", "ruins", "tidal", "storm", "highlands", "snow", "atoll", "twin"];

// boons: one of two at each departure, for the rest of the voyage
const BOONS = [
  { id: "deepWells", name: "Deep wells", desc: "Wells reach *3* tiles.", rules: r => { r.wellRadius = 3; } },
  { id: "quickCobbles", name: "Quick cobbles", desc: "Cobbles set at *12* wear, not 14.", rules: r => { r.wear.cobble = 12; } },
  { id: "richShoals", name: "Rich shoals", desc: "Each stretch of coast holds *8* fish, not 6.", rules: r => { r.stretch.fish = 8; } },
  { id: "longMemory", name: "Long memory", desc: "Trails grow back slower: wear keeps *85%* a night.", rules: r => { r.wear.decay = 0.85; } },
  { id: "handyBuilders", name: "Handy builders", desc: "Every builder does *2 builder-days* a day.", rules: r => { r.builderRate = 2; } },
  { id: "roomyHouses", name: "Roomy houses", desc: "Every house has *1 more* bed.", rules: r => { r.houseBonus = 1; } },
  { id: "fertileSoil", name: "Fertile soil", desc: "Every field makes *+1* food.", rules: r => { r.fieldBonus = 1; } },
  { id: "thrift", name: "Thrift", desc: "Prices climb *half as fast*.", rules: r => { r.costStep *= 2; } },
];
// heirlooms: a sidegrade taken along, one of two at each departure
const HEIRLOOMS = [
  { id: "oldTavern", name: "The Old Tavern", desc: "Taverns draw guests from a walk of *8*, but each keeper serves *4*.",
    rules: r => { r.tavernReach = 8; r.serve.tavern = 4; } },
  { id: "coveredMarket", name: "The Covered Market", desc: "Markets reach *2* tiles, but take at most *3* keepers.",
    rules: r => { r.marketReach = 2; r.jobs.market = 3; } },
  { id: "longBoats", name: "The Long Boats", desc: "Fishers catch *4* with the first hand, but a stretch holds *5*.",
    rules: r => { r.fisherOut = [4, 1]; r.stretch.fish = 5; } },
  { id: "stoneWell", name: "The Stone Well", desc: "Wells reach *3* tiles, but cost *twice* the coins.",
    rules: r => { r.wellRadius = 3; r.wellCoin = 2; } },
];
// charters: two optional goals per island, from its traits; each met is one more boon to pick
const CHARTERS = {
  meadow: [{ id: "cobbles40", name: "Forty cobbles", desc: "Cobble 40 tiles.", stat: "cobbles", goal: 40 },
    { id: "houses6", name: "Six houses", desc: "Rebuild 6 cottages as houses.", stat: "houses", goal: 6 }],
  stony: [{ id: "pave20", name: "Paved streets", desc: "Pave 20 tiles.", stat: "paved", goal: 20 },
    { id: "stone100", name: "Stonecutters", desc: "Quarry 100 stone.", stat: "stone", goal: 100 }],
  marsh: [{ id: "board12", name: "The long boardwalk", desc: "Lay 12 boardwalks.", stat: "boardwalks", goal: 12 },
    { id: "clay100", name: "Potters", desc: "Dig 100 clay.", stat: "clay", goal: 100 }],
  ruins: [{ id: "ruins2", name: "Restorers", desc: "Restore 2 ruins.", stat: "restored", goal: 2 },
    { id: "ghost10", name: "The old road", desc: "Cobble 10 tiles of the ghost paths.", stat: "ghostCobbles", goal: 10 }],
  highlands: [{ id: "summit", name: "The summit path", desc: "Wear a path to the summit.", stat: "summit", goal: 1 },
    { id: "wool60", name: "Shearers", desc: "Shear 60 wool.", stat: "wool", goal: 60 }],
  tidal: [{ id: "islets2", name: "Islet walkers", desc: "Wear a trail out to 2 islets.", stat: "islets", goal: 2 },
    { id: "causeway8", name: "The causeway", desc: "Lay 8 causeways.", stat: "causeways", goal: 8 }],
  storm: [{ id: "dry3", name: "Dry feet", desc: "Keep every field dry through 3 storms.", stat: "dryStorms", goal: 3 },
    { id: "walls10", name: "The sea wall", desc: "Build 10 sea walls.", stat: "seawalls", goal: 10 }],
  snow: [{ id: "larder16", name: "A full larder", desc: "Keep everyone fed for 16 winter days.", stat: "fedWinter", goal: 16 },
    { id: "lamps6", name: "Lanterns in the snow", desc: "Light 6 lamps.", stat: "lamps", goal: 6 }],
  atoll: [{ id: "ferry60", name: "A ferry both ways", desc: "Ferry villagers across the water 60 times.", stat: "ferried", goal: 60 },
    { id: "pearls60", name: "Pearl divers", desc: "Bring up 60 pearls.", stat: "pearls", goal: 60 }],
  twin: [{ id: "both8", name: "One village over both", desc: "Have 8 homes on the far isle.", stat: "farHomes", goal: 8 },
    { id: "bridges6", name: "The long bridges", desc: "Build 6 long bridges.", stat: "longbridges", goal: 6 }],
  great: [{ id: "hall", name: "The town hall", desc: "Raise the town hall.", stat: "townhall", goal: 1 },
    { id: "reclaim12", name: "Won from the sea", desc: "Reclaim 12 tiles of land.", stat: "reclaimed", goal: 12 }],
};

// NEW WORLD options (setup.js).  `later` rows are shown greyed until their phase.
// Each world freezes its settings; rules.js turns them into the rules in force.
const SETTINGS = [
  { key: "mode", label: "MODE", values: ["voyage", "sandbox"], names: ["Voyage", "Sandbox"], def: "voyage", later: true,
    tip: "Voyage: settle island after island. Sandbox: a toy, no goals." },
  { key: "length", label: "VOYAGE", values: [3, 5, 0], names: ["Short 3", "Standard 5", "Endless"], def: 5,
    tip: "How many islands before the Grand Festival." },
  { key: "size", label: "ISLAND", values: [18, 22, 28, 34], names: ["Small 18", "Medium 22", "Large 28", "Huge 34"], def: 22,
    tip: "Tiles across the first island." },
  { key: "grow", label: "GROWING", values: [true, false], names: ["On", "Off"], def: true,
    tip: "Each new island is 2 tiles bigger than the last." },
  { key: "weather", label: "WEATHER", values: ["calm", "seasonal", "wild"], names: ["Calm", "Seasonal", "Wild"], def: "seasonal",
    tip: "Calm: the seasons only for the look. Seasonal: the seasons' rules and storms. Wild: stronger storms, and the sea rises each winter." },
  { key: "rivers", label: "RIVERS", values: ["none", "one", "two", "random"], names: ["None", "One", "Two", "Random"], def: "random",
    tip: "Rivers cut the island into parts that bridges join." },
  { key: "forest", label: "FOREST", values: ["open", "wooded", "deep"], names: ["Open", "Wooded", "Deep"], def: "wooded",
    tip: "How much of the island is woods." },
  { key: "start", label: "START", values: ["generous", "standard", "frugal"], names: ["Generous", "Standard", "Frugal"], def: "standard",
    tip: "Starting stock, and how fast prices climb." },
];
// forest noise above `tree` grows woods (pines above `pine`); `scatter`: lone trees and rocks
const FOREST = { open: { tree: 0.64, pine: 0.76, scatter: 0.06 }, wooded: { tree: 0.58, pine: 0.72, scatter: 0.1 },
  deep: { tree: 0.52, pine: 0.68, scatter: 0.14 } };
// starting stock, and COST_STEP (a smaller step makes each copy dearer)
const START_KIND = { generous: { stock: { ...START, food: 10, wood: 20 }, costStep: 10 },
  standard: { stock: START, costStep: COST_STEP }, frugal: { stock: { ...START, food: 4, wood: 10 }, costStep: 6 } };

// ------------------------------------------------------------------ weather (weather.js)

// a year of four seasons; the Snow north's winter lasts twice as long
const SEASON_LEN = { usual: [10, 10, 10, 10], snow: [8, 8, 8, 16] };
const TIDE = { every: 12, days: 3 };      // a spring tide bares the sandbars 3 days in 12
const HARVEST = { day: 4, times: 3 };    // the harvest: the 5th day of autumn, fields bring in 3x
const STORM = { p: 0.035, fall: 0.07, stormCoast: 2, wild: 1.3, calmDays: 12 }; // chance a day; none in chapter 1 before day 12
const SPRING_TRAIL = 1.5;                // in spring trails form at this wear
const CLIMB = 0.4;                       // Highlands: each level uphill costs this much more
const FLOOD = { seasonal: 2, wild: 3 };  // how far inland a storm floods (tiles): the shore, and the ring behind it

// ------------------------------------------------------------------ moments (events.js, shapes.js)

// the event deck: one event at a time, at least `gap` days after the last began, then a
// `p` chance each morning.  Chapter 1 waits for its first milestone
const EVENT = { gap: 6, p: 0.4, reach: 1 };
// a stranger's footprints lead to a hidden spot for `days`; the herd crosses on 2 days
// with `n` animals; a wreck waits on its sandbar through the next spring tide
const STRANGER = { days: 16, crew: 2, near: 5 };
const HERD = { days: 2, n: 5 };
const WRECK = { days: 15, wood: 8, perChapter: 4 };
// the night merchant sails by every `every` days (seeded) once lamps are known, and
// stops if a lit path (path or cobbles, each tile within `reach` of a lamp) runs from
// the shore to a tavern.  Its lots and prices (coins); an heirloom, a boon and a
// cosmetic cost more on later islands
const MERCHANT = { every: 7, reach: 2,
  lots: { food: { n: 20, price: 30 }, wood: { n: 20, price: 50 }, goods: { n: 20, price: 40 } },
  heirloom: 150, boon: 600, reroll: 40, cosmetic: 150 };
const FEAST = { min: 2 };
// pirates bury a chest and sail off; a torn map rings where it lies, the ring closing in
// every `shrink` days; a walk over the very tile (or a building on it) digs it up
const TREASURE = { days: 12, shrink: 4, coin: 60, perChapter: 60 };  // festival day: tiles this many villagers walked become the flagstone scar

// what events leave on the map, as feature characters: they stand like trees (block
// walking) and the axe can clear them once their moment is over
const PROPS = { H: { name: "Hermit's hut", spr: "hermit" }, S: { name: "Shrine", spr: "shrine" },
  B: { name: "Castaways' camp", spr: "boat" }, X: { name: "Wreck", spr: "wreck" } };

// cosmetics, found with the secret shapes (or bought from the merchant): profile-wide
// sidegrades.  Hats are worn by some villagers; a pattern paves one island's cobbles
const COSMETICS = {
  strawhat: { kind: "hat", name: "Straw hat" }, knitcap: { kind: "hat", name: "Knitted cap" },
  flowers: { kind: "hat", name: "Flower crown" }, souwester: { kind: "hat", name: "Sou'wester" },
  tricorn: { kind: "hat", name: "Pirate's tricorn" },
  herringbone: { kind: "pattern", name: "Herringbone" }, flagstone: { kind: "pattern", name: "Pale flagstone" },
  brick: { kind: "pattern", name: "Brick" }, pebbles: { kind: "pattern", name: "River pebbles" },
};
// the secret shapes (shapes.js), each with its reward; the shrine is found by an event
// (hint: what an unfound page says)
const SECRETS = [
  { id: "ring", name: "Ring round the hearth", gift: "flowers", desc: "A closed loop of path around the hearth and its square.", hint: "Something goes all the way round the fire." },
  { id: "eight", name: "Figure eight", gift: "herringbone", desc: "Two loops of path that touch at a single tile.", hint: "Two loops, and they barely touch." },
  { id: "spiral", name: "Spiral", gift: "pebbles", desc: "One path without a fork, winding one and a half turns round a point.", hint: "Round and round, and never closing." },
  { id: "tour", name: "Grand tour", gift: "strawhat", desc: "One network of cobbles touching every building on the island but the fields (20 at least).", hint: "Every door on one street." },
  { id: "mile", name: "Straight mile", gift: "flagstone", desc: "12 cobbles in a straight row.", hint: "Straight as a rule, and long." },
  { id: "coast", name: "Coast to coast", gift: "souwester", desc: "Cobbles joining two opposite shores, across the middle of the island.", hint: "From sea to sea." },
  { id: "lantern", name: "Lantern walk", gift: "brick", desc: "8 lamps along one cobbled path.", hint: "A string of lights along one way." },
  { id: "shrine", name: "The shrine", gift: "knitcap", desc: "Found at the end of a stranger's footprints.", hint: "Follow a stranger's footprints.", event: true },
];
