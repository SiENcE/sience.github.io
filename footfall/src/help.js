/* The codex: every rule on its own page, sorted into categories, each with a
 * live pixel illustration, a few lines to reread, and SHOW ME, which closes the
 * book and replays that lesson's cue on the island.  A page opens once its
 * lesson has come up (or its building is unlocked); a gold dot marks pages
 * that haven't been read.  Open with the ? button or H.
 */
"use strict";

const CATS = [["basics", "BASICS"], ["paths", "PATHS"], ["build", "BUILDINGS"], ["town", "TOWN"], ["voyage", "VOYAGE"], ["islands", "ISLANDS"],
  ["weather", "WEATHER"], ["events", "EVENTS"], ["secrets", "SECRETS"]];

const PAGES = [
  { id: "building", cat: "basics", name: "Building", lesson: "cutter", always: true, icon: "c_cottage", art: artBuilding, text: [
    "Pick a card in the bar at the bottom, then click a tile. Cards show their cost: *wood* in brown, *coins* in gold. Each copy costs a little more than the last.",
    "Once a category holds several buildings (homes, food, crafts, trade, land, street), its card shows *three dots*: it opens a row of them.",
    "While a card is held, the island shows what it would do there. Right-click or Esc lets go of it. The *axe* clears trees and buildings.",
  ] },
  { id: "days", cat: "basics", name: "Days", lesson: "endday", always: true, icon: "c_field", art: artDays, text: [
    "Build as much as you like, then press *END DAY*. Your villagers walk to work, make food, wood and coins at midday, and walk home at dusk.",
    "The small numbers beside your stock are *tomorrow's forecast* - exactly what the day will bring.",
  ] },
  { id: "homes", cat: "basics", name: "Homes & work", lesson: "house", icon: "c_cottage", art: artHomes, text: [
    "Every cottage sleeps *2* (+1 beside *cobbles*, +1 near a *well*). Each morning villagers take the *nearest free job* by walking distance; anyone left over is a *free hand*.",
    `After work they meet at the *hearth* (if it is within a walk of ${R.hearthReach}) before going home, so paths gather around it. The *square* round it stays open: nothing can be built there.`,
    "Hover a building to see who works there and the route they walk.",
  ] },
  { id: "growth", cat: "basics", name: "Growth", lesson: "grow", icon: "i_food", art: artGrowth, text: [
    `After supper (1 food each), a newcomer sails in if there is a *free bed* and *${R.arriveFood} spare food*.`,
    `One arrives per night - one more with a cheerful tavern, a tended lighthouse, or when nearly everyone works (*word spreads*, from ${R.word.pop} villagers). Nobody ever leaves, and nothing is lost if food runs short.`,
  ] },
  { id: "goals", cat: "basics", name: "Milestones", lesson: "goal", icon: "c_well", art: artGoals, text: [
    "Each milestone is a number of villagers. Reaching it unlocks new buildings - the plate at the top right shows the next one.",
    "At *40 villagers* the island holds a festival. After that, keep building as long as you like.",
  ] },
  { id: "camera", cat: "basics", name: "Looking around", lesson: "pan", icon: "c_lighthouse", art: artCamera, text: [
    "Drag the island to move around, or use the *arrow keys*. The *mouse wheel* (or *+* and *-*, or a pinch) zooms. Number keys pick cards, *Space* ends the day, *H* opens this book, *P* shows the paths.",
    "The *>>* button plays days at double speed. Click END DAY while a day plays to skip ahead.",
  ] },
  { id: "jobs", cat: "basics", name: "Jobs & hands", lesson: "hands", always: true, icon: "c_workshop", art: artJobs, text: [
    "Most workplaces take *several workers*: a field or fisher 2, a woodcutter 2, a workshop 4. Every workplace fills its *first job* before any takes a second, nearest walker first.",
    "Markets and taverns take on *keepers as trade grows*: one for every 8 passers-by (5 guests) they had the day before.",
    "Villagers left without a job are *free hands* (the hand at the top). They raise building sites, or sit at the hearth.",
  ] },
  { id: "sites", cat: "basics", name: "Building sites", lesson: "hands", icon: "c_house", art: artSites, text: [
    "Big projects - a *workshop*, the *lighthouse*, rebuilding a cottage as a *house* - start as a building site.",
    `Each morning *free hands* walk to the nearest site (up to ${R.siteCrew} a site) and do a *builder-day* of work. The site is finished at night when its builder-days are done. Keep a few hands free, or nothing gets built.`,
  ] },
  { id: "sleep", cat: "basics", name: "Sleep", lesson: "sleep", icon: "c_well", art: artSleep, text: [
    "*SLEEP* (or *Z*) plays day after day quickly, and wakes you when something happens: a newcomer, a milestone, a building finished, or something new you can afford.",
    "Any click wakes the village too.",
  ] },
  { id: "desire", cat: "paths", name: "Desire paths", lesson: "paths", always: true, icon: "c_tree", art: artDesire, text: [
    "There are no roads to build. Wherever villagers walk, the grass wears into a *trail*, then a *path*, and busy paths become *cobbles*.",
    "Walking is cheaper on worn ground: *1* on grass, *0.8* on a trail, *0.6* on a path, *0.4* on cobbles. Unused trails grow back; cobbles nobody walks for weeks grow over too.",
    "Homes and workshops are entered by their *door*, on the front (the two sides facing you): paths lead up to it and round the back.",
    "A cottage beside *cobbles* is a street-front house with a *third bed*.",
    "Lost in a busy village? The *footprints* button (or *P*) lays trees and buildings flat, so every path shows.",
  ] },
  { id: "commute", cat: "paths", name: "Commute", lesson: "commute", icon: "c_woodcutter", art: artCommute, text: [
    `A worker who walks more than *${R.tired[0]}* to work is tired: *-1* output. More than *${R.tired[1]}*: *-2*.`,
    "Build work near homes - or let the paths between them wear in, and the walk shrinks by itself.",
  ] },
  { id: "footfall", cat: "paths", name: "Footfall", lesson: "market", icon: "c_market", art: artFootfall, text: [
    "Markets earn *1 coin for every villager* who walks past (on the 8 tiles around them) during the day.",
    "Put them where the paths are busiest. With the market card held, gold dots show yesterday's footfall.",
  ] },
  { id: "steering", cat: "paths", name: "Steering", lesson: "grove", icon: "c_tree", art: artSteering, text: [
    "Villagers walk around trees, rocks and buildings, and over bridges. Plant *trees* to steer paths past a market - or away from your fields.",
    "Each building placed on a path removes it; the villagers find a new way the next morning.",
  ] },
  { id: "field", cat: "build", name: "Field", lesson: "field", b: "field", icon: "c_field", art: artField, text: [
    "*2 food* a day, *+2 on a meadow* (the yellow-green patches with flowers), and *+1 for each field* touching its sides (up to +2). A second worker adds *+1*.",
    "Fields can't be walked through, so a block of them also bends the paths around it.",
  ] },
  { id: "woodcutter", cat: "build", name: "Woodcutter", lesson: "cutter", b: "woodcutter", icon: "c_woodcutter", art: artCutter, text: [
    "*1 wood for every 2 trees* within 2 tiles, up to 4; a second worker adds half as much. The trees are never used up.",
  ] },
  { id: "fisher", cat: "build", name: "Fisher", lesson: "fisher", b: "fisher", icon: "c_fisher", art: artFisher, text: [
    `*${R.fisherOut[0]} food* a day, *+${R.fisherOut[1]}* with a second worker. Must stand on a tile beside the sea.`,
    `The coast is split into *stretches* of about ${R.stretch.len} shore tiles, each holding *${R.stretch.fish} fish* a day, shared by the fishers on it. Holding the card shows the stretch.`,
  ] },
  { id: "market", cat: "build", name: "Market", lesson: "market", b: "market", icon: "c_market", art: artFootfall, text: [
    "*1 coin* for every villager passing within one tile; each keeper serves 8. Coins pay for wells, taverns, houses and the lighthouse.",
    "Houses need a market on their people's way: that is where they buy their *goods*.",
  ] },
  { id: "bridge", cat: "build", name: "Bridge & tree", lesson: "bridge", b: "bridge", icon: "c_tree", art: artBridge, text: [
    "Rivers cut the island into parts, each with its own forests and meadows. A *bridge* lets villagers cross: build it where land lies on both banks. From 10 villagers, a *tree* (1 wood) feeds woodcutters and blocks walking.",
  ] },
  { id: "well", cat: "build", name: "Well", lesson: "well", b: "well", icon: "c_well", art: artWell, text: [
    "Every cottage within *2 tiles* gets a *third bed*. Several wells don't stack.",
  ] },
  { id: "tavern", cat: "build", name: "Tavern", lesson: "tavern", b: "tavern", icon: "c_tavern", art: artTavern, text: [
    `Workers whose job is within a walk of *${R.tavernReach}* stop by on the way home: *1 coin each*, 5 per keeper. With *${R.tavernCheer} guests* the village is cheerful and invites an *extra newcomer* that night.`,
  ] },
  { id: "lighthouse", cat: "build", name: "Lighthouse", lesson: "lighthouse", b: "lighthouse", icon: "c_lighthouse", art: artLighthouse, text: [
    `Stands on the shore. While its *keeper* tends the lamp it guides boats in: *one extra newcomer* every night. A big project: *${BD.lighthouse.labour} builder-days*. Only one per island.`,
  ] },
];

PAGES.push(
  { id: "workshop", cat: "town", name: "Workshop", lesson: "workshop", b: "workshop", icon: "c_workshop", art: artWorkshop, text: [
    `Each worker turns *1 wood into ${R.goods.perWood} goods*, up to 4 workers. Workshops leave ${R.woodKeep} wood in store.`,
    `Houses use *${R.goods.perResident} good* for each resident a night. A building site at first: *${BD.workshop.labour} builder-days*.`,
  ] },
  { id: "house", cat: "town", name: "House", lesson: "rebuild", b: "house", icon: "c_house", art: artHouse, text: [
    `Rebuilds a cottage (*${BD.house.labour} builder-day*) with *${R.houseExtra} more beds*, plus the street and well beds as before: up to 6.`,
    "The extra beds open while its people *pass a market* (and there are *goods*), and *meet someone in the evening* (tavern, hearth or a bench). Otherwise a bubble over the roof says what it wants. Nobody moves out.",
  ] },
  { id: "street", cat: "town", name: "Street", lesson: "street", b: "stall", icon: "c_stall", art: artStreet, text: [
    "Things for *cobbled* streets. They stand on the cobbles without blocking them.",
    "A *stall* earns 1 coin for every 3 steps on its tile. A *bench* counts as meeting someone for those who pass it on the way home. *Lamps* light the street at night; *flowers* are for the pleasure of it.",
  ] },
);

PAGES.push(
  { id: "ship", cat: "voyage", name: "The ship", lesson: "ship", b: "ship", icon: "c_ship", art: artShip, text: [
    "When an island meets its goal (the *festival* on the first), the *ship* can be built: a big project, longer each chapter, and it costs coins.",
    "Once it is ready, *SAIL* when you like: there is no hurry, and a bigger island sends a bigger crew and richer tribute.",
  ] },
  { id: "chartpage", cat: "voyage", name: "The sea chart", lesson: "sail", icon: "c_lighthouse", art: artChart, text: [
    "The *chart* (the compass button, or *M*) shows every island of the voyage. Two new islands are on offer each time you sail; each brings *something you haven't played yet*. The one you don't pick is gone.",
    "Every island is bigger than the last, and its goal higher. Settled islands can be *visited*: their last day plays again.",
  ] },
  { id: "boons", cat: "voyage", name: "Boons & heirlooms", tab: "Boons", lesson: "sail", icon: "i_coin", art: artBoons, text: [
    "At each departure you pick a *boon* for the rest of the voyage (a coin *reroll* once), and an *heirloom*: a different shape of something you know.",
    "Each island has two *charters*, optional goals shown on the chart. Every charter met adds a boon to pick.",
  ] },
  { id: "tribute", cat: "voyage", name: "Tribute & harbour", tab: "Tribute", lesson: "harbour", b: "harbour", icon: "c_harbour", art: artTribute, text: [
    `The islands you leave behind are *settled*: they stay as you left them and send a *tribute boat* every ${TRIBUTE_EVERY} days, with their specialty, some food and wood, and a *settler*.`,
    "Without a *harbour* only a third of the load comes ashore; its dockers land all of it. They only work on boat days.",
  ] },
  { id: "stony", cat: "islands", name: "Stony isle", lesson: "quarry", b: "quarry", icon: "c_quarry", art: artStony, text: [
    `Rocks and boulders everywhere, and *scree* that costs *${R.scree}* to cross until a trail wears in.`,
    "A *quarry* cuts 1 stone for each rock beside it. *Paving* spends 2 stone to lay cobbles at once, wherever you want a street.",
  ] },
  { id: "marsh", cat: "islands", name: "Marsh isle", lesson: "claypit", b: "claypit", icon: "c_claypit", art: artMarsh, text: [
    `*Marsh* costs *${R.marsh}* to walk and can't be built on. A *boardwalk* (1 wood) makes it *${R.boardwalk}*.`,
    "A *clay pit* digs 1 clay for each marsh tile beside it. Workshops turn clay into goods before they use wood.",
  ] },
  { id: "ruins", cat: "islands", name: "Ruin isle", lesson: "ruins", icon: "c_well", art: artRuins, text: [
    "*Ghost paths* of an older village run across the island: they never grow back, so they are cheap to walk from the first day.",
    "Get a *cobbled* tile beside a *ruin* and it is restored: 25 coins, and the charters count it.",
  ] },
);

// phase 3: the weather, and the traits it brings
PAGES.push(
  { id: "seasons", cat: "weather", name: "Seasons", lesson: "weather", always: true, icon: "c_field", art: artSeasons, text: [
    "A year has four seasons of *10 days*. The strip under your stock shows *today and the next two days*.",
    `*Spring*: trails form at ${SPRING_TRAIL} wear. *Summer*: meadow fields +1. *Autumn*: the *harvest*, one day when fields bring in ${HARVEST.times}x. *Winter*: fields rest.`,
    "A *Calm* world keeps the look of the seasons and none of their rules.",
  ] },
  { id: "winter", cat: "weather", name: "Winter", lesson: "winter", icon: "c_fisher", art: artWinter, text: [
    "In winter *fields rest*: only fishers (and lodges) bring in food, and the field hands are free to build. Fill the larder in autumn.",
    "Snow shows *every footstep*: each morning the prints of the day before.",
  ] },
  { id: "storms", cat: "weather", name: "Storms", lesson: "storm", icon: "c_fisher", art: artStorms, text: [
    "A storm shows in the strip *two days ahead*. It floods the shore and the ring of land behind it: fields there make nothing, fishers stay ashore, and *no boat* comes in that night. Nothing is lost: boats come the day after.",
    "*Cobbles* stop the water, and on the Storm coast so do *sea walls*: a paved shore is a levee.",
  ] },
  { id: "tides", cat: "weather", name: "Spring tides", lesson: "tide", icon: "c_pier", art: artTides, text: [
    `On a Tidal isle, every ${TIDE.every} days a *spring tide* bares the sandbars for ${TIDE.days} days: villagers walk out to the *islets*. Work out there waits while the tide is in.`,
    "A *causeway* keeps a sandbar open at any tide.",
  ] },
  { id: "threats", cat: "weather", name: "Gulls & serpents", tab: "Gulls", lesson: "storm", icon: "c_lighthouse", art: artThreats, text: [
    "*Gulls* raid shore fields nobody else walks past: they take half the crop. Feet keep them off.",
    "Some days a *sea serpent* lurks: one tribute boat turns back until the next day, unless the *lighthouse* is lit.",
  ] },
  { id: "rise", cat: "weather", name: "The rising sea", lesson: "rise", icon: "c_harbour", art: artRise, text: [
    "In a *Wild* world the sea rises on the first night of every winter: the outer ring of open shore goes under (the lowest ground in the Highlands).",
    "Whatever stood there is *refunded in full*, and its people move to free beds. *Cobbles* and *sea walls* hold the sea back.",
  ] },
  { id: "highlands", cat: "islands", name: "Highlands", lesson: "heights", b: "shepherd", icon: "c_shepherd", art: artHighlands, text: [
    `Hills in terraces: every step *uphill* costs *${R.climb}* more a level, and a drop of two levels is a *cliff*. Paths switchback up the slopes by themselves.`,
    "A *shepherd* keeps 3 sheep: 1 wool for every 2 open grass tiles near the hut. The flock grazes out and back, trampling a trail. Workshops spin wool into goods.",
  ] },
  { id: "tidal", cat: "islands", name: "Tidal isle", lesson: "tide", b: "pier", icon: "c_pier", art: artTidal, text: [
    "Sand along the shore (it wears into trails faster), *sandbars* and *islets* offshore. The spring tide opens the way; *causeways* keep it open.",
    "A *tide pier*'s gatherers comb the flats: 1 coin for each sandbar tile within 2, twice while the tide is out.",
  ] },
  { id: "stormcoast", cat: "islands", name: "Storm coast", lesson: "seawall", b: "seawall", icon: "c_fisher", art: artStormCoast, text: [
    `Storms come *${STORM.stormCoast}x* as often. In return the shoals are rich: a stretch of coast holds *${R.stretch.fish + R.stormFish} fish*.`,
    "A *sea wall* on the shore stops the flood behind it, and can be walked along.",
  ] },
  { id: "snownorth", cat: "islands", name: "Snow north", lesson: "lodge", b: "lodge", icon: "c_lodge", art: artSnowNorth, text: [
    `A *long winter* (${SEASON_LEN.snow[3]} days): fields rest and the rivers *freeze*, so villagers walk across without a bridge. Snowfields cost *${R.snowfield}* until trodden.`,
    "A *lodge*'s hunters bring 2 food each, 3 in winter, and homes within 2 tiles are warm: *+1 bed*.",
  ] },
);

// phase 4: the moments (events.js) and the secret shapes (shapes.js)
PAGES.push(
  { id: "stranger", cat: "events", name: "Footprints", lesson: "stranger", icon: "c_cottage", art: artStranger, text: [
    "Now and then a line of *footprints* runs from the shore into the woods, to a spot marked *?*. Get a villager's walk *within 1 tile* of it: put work beyond it, or a bridge across to it.",
    "What waits there is a *hermit* (a boon for the voyage), a *shrine* (a secret) or *castaways* (new villagers). Nobody comes, and after a while the trail goes cold.",
  ] },
  { id: "herd", cat: "events", name: "Migrating herd", tab: "Herd", lesson: "herd", icon: "c_tree", art: artHerd, text: [
    `Once a season a *herd* of ${HERD.n} deer crosses the island from shore to shore, on two days, trampling a *trail* as it goes. Villagers may take to it.`,
    "Deer keep away from streets and houses, and go round trees: *plant trees* to turn the herd, or wall off its way and it turns back to the sea.",
  ] },
  { id: "merchant", cat: "events", name: "Night merchant", tab: "Merchant", lesson: "merchant", b: "lamp", icon: "c_lamp", art: artMerchant, text: [
    `Every ${MERCHANT.every} days the *night merchant*'s sail passes (a lantern in the weather strip). It stops only if a *lit path* leads from the shore to a *tavern*: path or cobbles all the way, every tile within ${MERCHANT.reach} of a *lamp*.`,
    "Then its cart stands by the tavern for a day: *food, wood and goods* by the lot, an *heirloom*, a *boon*, a free boon *reroll*, and now and then a hat or a cobble pattern. For coins.",
  ] },
  { id: "feast", cat: "events", name: "The feast", lesson: "feast", icon: "c_well", art: artFeast, text: [
    "The day after a festival is a *feast*: after work *everyone* walks to the hearth, however far.",
    "The paths of that one day stay for good as a *scar* of pale flagstones: a picture of the village as it was.",
  ] },
  { id: "wreck", cat: "events", name: "A wreck", lesson: "wreck", icon: "c_pier", art: artWreck, text: [
    `On a Tidal isle a spring tide sometimes leaves a *wreck* on a sandbar. A walk within 1 tile of it brings in *driftwood* (${WRECK.wood} wood and more on later islands) and a *castaway*.`,
    "Sandbars are dry only at a spring tide, unless a *causeway* crosses them. Wait too long and the tide takes the wreck.",
  ] },
  { id: "ghost", cat: "events", name: "Ghost paths", lesson: "ruins", icon: "c_well", art: artRuins, text: [
    "On a Ruin isle the *ghost paths* of an older village never grow back: trails from the first day, cheap to walk.",
    "Cobble a tile beside a *ruin* to restore it (25 coins).",
  ] },
);
// phase 5: the finale, the late game and the last two traits
PAGES.push(
  { id: "chronicle", cat: "basics", name: "The chronicle", tab: "Chronicle", lesson: "chronicle", always: true, icon: "c_cat_trade", art: artChronicle, text: [
    "The *bars* button (or *C*) opens the island's *chronicle*: villagers, beds and free hands, the stock, and the paths over every day played, with the winters shaded.",
    "STORY lists everything that happened here; REALM every island of the voyage, its trade, the charters and the secrets.",
  ] },
  { id: "townhall", cat: "town", name: "Town hall", lesson: "townhall", b: "townhall", icon: "c_townhall", art: artTownhall, text: [
    `Once an island has met its goal (on later islands, from the start) the *town hall* can be raised: a big project of *${BD.townhall.labour} builder-days*, and its coins grow each chapter.`,
    "While its *clerks* work it brings *one more newcomer* a night, and it opens the *grand market* and *reclaiming land*.",
  ] },
  { id: "grandmarket", cat: "town", name: "Grand market", tab: "Grand market", lesson: "grandmarket", b: "grandmarket", icon: "c_grandmarket", art: artGrandMarket, text: [
    `A market hall: *1 coin* for every villager passing within *${R.grandReach} tiles*, ${BD.grandmarket.serve} per keeper, up to ${BD.grandmarket.jobs} keepers.`,
    "Its passers-by have *met someone* too: a house on their way has its company. Houses buy their *goods* there as at any market.",
  ] },
  { id: "reclaim", cat: "town", name: "Reclaim land", tab: "Reclaim", lesson: "reclaim", b: "reclaim", icon: "c_cat_land", art: artReclaim, text: [
    "With the town hall standing, *dike and fill* a tile of sea beside the shore: *new land* to build on. Each costs a little more than the last.",
    "Not in front of a fisher, pier or harbour: they need their water. The coast moves out, and the fish stretches with it.",
  ] },
  { id: "letters", cat: "voyage", name: "Letters & trade", tab: "Letters", lesson: "letters", icon: "c_harbour", art: artLetters, text: [
    `Now and then a *settled island writes*: it asks for goods, wood, coins or this island's own trade (the envelope under the goal). The next *tribute boat* from it takes the load home from your *harbour*, if you have it that night.`,
    `Each letter answered is a *level of trade*: that island's tribute grows by *${Math.round(LETTER.grow * 100)}%* a level, and its boat brings back a *double load* at once. Unanswered letters simply lapse.`,
  ] },
  { id: "grandfest", cat: "voyage", name: "The Grand Festival", tab: "Grand Festival", lesson: "grand", icon: "c_ship", art: b => artGrand(b), text: [
    "The voyage's last island is the *Great isle*: the largest, with a little of every island before it. Its goal is the *Grand Festival*.",
    "Every settled island sends a boat, the sea fills with sails, and the fireworks come back bigger. The voyage is complete, and the world is kept.",
  ] },
  { id: "endless", cat: "voyage", name: "Sailing on", tab: "Endless", lesson: "grand", icon: "c_ship", art: artEndless, text: [
    "After the Grand Festival (or in an *Endless* world from the start) the voyage can *sail on* without end: build the ship again, and the chart keeps offering islands.",
    `Each is bigger (up to ${ISLAND_MAX} tiles) and its goal *25 higher*. The chart offers the traits played least first, so every one comes round again.`,
  ] },
  { id: "atoll", cat: "islands", name: "Atoll", lesson: "ferry", b: "ferry", icon: "c_ferry", art: artAtoll, text: [
    "A ring of sand round a *lagoon*: palms on the ring, mangroves at the water's edge, bright fish in the shallows.",
    `A *ferry pier* on the shore runs a ferry *straight across* the water to the shore opposite: *${R.ferry}* a tile to cross, and the long walk round is gone. Its divers bring up *pearls*, which markets sell (${R.pearl.price} coins each, one for every ${R.pearl.per} passers-by).`,
  ] },
  { id: "twin", cat: "islands", name: "Twin isles", lesson: "longbridge", b: "longbridge", icon: "c_cat_land", art: artTwin, text: [
    "Two islands across a *strait*. At a *spring tide* the sandbar ford can be walked; otherwise, build *long bridges* over the water, one tile at a time.",
    "The far isle has its own woods and meadows: a village over both earns a charter.",
  ] },
  { id: "great", cat: "islands", name: "Great isle", lesson: "townhall", icon: "c_townhall", art: artGreat, text: [
    "The voyage's last and largest island. It mixes up to three of the traits you have played, and the *town hall* can be raised from the first day.",
    "Its charters: *the town hall*, and *land won from the sea*.",
  ] },
  { id: "treasure", cat: "events", name: "Pirates' treasure", tab: "Treasure", lesson: "treasure", icon: "c_cat_trade", art: b => artTreasure(b), text: [
    "Now and then a *pirate ship* anchors offshore, buries a chest and sails away. A red *ring* on their map shows where it lies; every few days the ring closes in, until it marks the very tile.",
    `A villager who *walks over that tile* digs it up (so does a building put on it): coins, and the first time a pirate's hat. After ${TREASURE.days} days the pirates come back for it.`,
  ] },
);
const SECRET_TAB = { ring: "Ring", mile: "The mile", coast: "Sea to sea", lantern: "Lanterns" };
for (const s of SECRETS) PAGES.push({ id: s.id, cat: "secrets", name: s.name, tab: SECRET_TAB[s.id], lesson: s.id, secret: true, icon: "c_lamp", art: b => artSecret(b, s.id, false), text: [
  s.desc, `Found: *${COSMETICS[s.gift].name}*, ${COSMETICS[s.gift].kind === "hat" ? "a hat some villagers now wear, on every island" : "a pattern to pave any island's cobbles with"}.`,
] });

const pageOpen = p => (p.secret ? PROFILE.secrets.includes(p.id) : p.always || learned(p.lesson) || (p.b && unlocked(BD[p.b])));
const codexUnread = () => PAGES.some(p => pageOpen(p) && !PROFILE.read.includes(p.id));

function openCodex(id) {
  const first = PAGES.find(p => pageOpen(p) && !PROFILE.read.includes(p.id)) || PAGES[0];
  const page = PAGES.find(p => p.id === id) || first;
  ui.codex = { page: page.id, cat: page.cat };
  ui.tapTip = null; ui.tool = null;
  sfx.page();
}
function closeCodex() { ui.codex = null; }

function drawCodex() {
  ui.hot = [];
  hotspot(0, 0, VW, VH, "cx:out", closeCodex); // clicking outside the book closes it
  ctx.fillStyle = ditherPattern(8, "#0a0c18");
  ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(VW - 8, 400), h = Math.min(VH - 8, 262);
  const x = Math.round((VW - w) / 2), y = Math.round((VH - h) / 2);
  hotspot(x, y, w, h, "cx:win", null);
  windowBox(x, y, w, h);
  rect(x + 2, y + 2, w - 4, 13, C.winLo);
  text("HOW TO PLAY", x + 7, y + 4, { font: "caps", colour: C.gold });
  const bx = x + w - 17;
  let hv = hotspot(bx, y + 2, 14, 13, "cx:close", closeCodex);
  buttonBox(bx, y + 2, 14, 13, { hover: hv, pressed: pressed("cx:close", hv) });
  icon("close", bx + 5, y + 6 + (pressed("cx:close", hv) ? 1 : 0), C.text);

  // categories: tall enough that a pressed label (1px lower) still clears the bottom edge.
  // On a narrow screen the title gives way, then the tabs close up
  const tabsW = p => CATS.reduce((a, [, n]) => a + textWidth(n, "caps") + p + 2, 0);
  const wide = tabsW(10) <= w - 110, pad = wide || tabsW(10) <= w - 26 ? 10 : 6;
  // (and on a phone they wrap onto a second row)
  let cx0 = wide ? x + 90 : x + 4, row = 0;
  if (!wide) rect(x + 2, y + 2, w - 21, 13, C.winLo);
  for (const [id, name] of CATS) {
    const tw = textWidth(name, "caps") + pad, on = ui.codex.cat === id, hid = "cx:cat:" + id;
    if (cx0 + tw > x + w - (row ? 4 : 20)) { row++; cx0 = x + 4; rect(x + 2, y + 2 + row * 14, w - 4, 13, C.winLo); }
    const ty = y + 2 + row * 14;
    hv = hotspot(cx0, ty, tw, 13, hid, () => { ui.codex.cat = id; ui.codex.page = (PAGES.find(p => p.cat === id && pageOpen(p)) || PAGES.find(p => p.cat === id)).id; });
    buttonBox(cx0, ty, tw, 13, { hover: hv, pressed: on || pressed(hid, hv) });
    text(name, cx0 + pad / 2, ty + 2 + (on || pressed(hid, hv) ? 1 : 0), { font: "caps", colour: on ? C.gold : C.dim });
    if (PAGES.some(p => p.cat === id && pageOpen(p) && !PROFILE.read.includes(p.id))) rect(cx0 + tw - 4, ty + 2, 2, 2, C.gold);
    cx0 += tw + 2;
  }
  const top = y + row * 14;

  const page = PAGES.find(p => p.id === ui.codex.page);
  if (pageOpen(page) && !PROFILE.read.includes(page.id)) { PROFILE.read.push(page.id); saveProfile(); }

  const pages = PAGES.filter(p => p.cat === ui.codex.cat);
  const listW = w >= 330 ? 104 : 0;
  if (listW) {
    // as many rows as fit above the toggles; more pages scroll, keeping the one open in view
    const rows = Math.max(3, Math.floor((y + h - 36 - (top + 18)) / 18)), sel = pages.findIndex(p => p.id === ui.codex.page);
    let off = Math.max(0, Math.min(ui.codex.off || 0, pages.length - rows));
    if (sel >= 0 && sel < off) off = sel; else if (sel >= off + rows) off = sel - rows + 1;
    ui.codex.off = off;
    pages.slice(off, off + rows).forEach((p, i) => codexTab(p, x + 4, top + 18 + i * 18, listW, 17, true));
    if (pages.length > rows) {
      smallButton("cx:up", x + 4, top + 18 + rows * 18 - 2, listW / 2 - 1, "left", () => { ui.codex.off = Math.max(0, off - 1); }, { disabled: !off });
      smallButton("cx:down", x + 5 + listW / 2, top + 18 + rows * 18 - 2, listW / 2 - 1, "right", () => { ui.codex.off = off + 1; }, { disabled: off + rows >= pages.length });
    }
  } else pages.forEach((p, i) => codexTab(p, x + 4 + (i % 16) * 22, top + 18 + Math.floor(i / 16) * 21, 21, 20, false));
  hintsToggle(x + 4, y + h - 17, listW || 80);
  zoomToggle(listW ? x + 4 : x + 88, listW ? y + h - 31 : y + h - 17, listW || 80);

  const cx = listW ? x + listW + 9 : x + 5, cy = listW ? top + 18 : top + 42, cw = listW ? w - listW - 13 : w - 10;
  const open = pageOpen(page);
  text(open ? page.name : "???", cx + 1, cy, { font: "big", colour: open ? "#ffe8b0" : C.faint });
  const sec = page.secret && SECRETS.find(s => s.id === page.id);
  const art = { x: cx, y: cy + 17, w: cw, h: 84 };
  slotBox(art.x, art.y, art.w, art.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(art.x + 2, art.y + 2, art.w - 4, art.h - 4); ctx.clip();
  rect(art.x + 2, art.y + 2, art.w - 4, art.h - 4, "#4a9fc0");
  if (open) page.art({ x: art.x + 2, y: art.y + 2, w: art.w - 4, h: art.h - 4 });
  else { ctx.fillStyle = ditherPattern(6, "#2c3350"); ctx.fillRect(art.x, art.y, art.w, art.h); }
  // an unfound secret: its shape, faint
  if (!open && sec) artSecret({ x: art.x + 2, y: art.y + 2, w: art.w - 4, h: art.h - 4 }, sec.id, true);
  ctx.restore();

  let ty = art.y + art.h + 6;
  const body = open ? page.text : sec ? [`*${sec.hint}*`, "A secret: find it on any island, and this page opens."]
    : [page.b ? `Unlocks at *${(MILESTONES.find(m => m.unlock.includes(page.b)) || {}).pop} villagers*.` : "Keep playing - this page opens when it matters."];
  for (const para of body) {
    for (const line of wrap(para, cw - 4)) { rich(line, cx + 2, ty, C.dim); ty += 9; }
    ty += 4;
  }

  // a found secret's gift: pave this island with the pattern, or put the hats on and off
  if (open && sec) {
    // (on a phone, a row above the others)
    const g = COSMETICS[sec.gift], gw = 84, gx = listW ? cx + cw - 64 - gw - 4 : cx + cw - gw, gy = y + h - (listW ? 18 : 34);
    const on = g.kind === "hat" ? !PROFILE.hatsOff : S.pattern === sec.gift;
    const label = g.kind === "hat" ? (on ? "HATS: ON" : "HATS: OFF") : on ? "PAVED HERE" : "PAVE HERE";
    hv = hotspot(gx, gy, gw, 14, "cx:gift", () => {
      if (g.kind === "hat") PROFILE.hatsOff = !PROFILE.hatsOff;
      else { S.pattern = on ? "cobble" : sec.gift; terrain.dirty = true; save(); }
      saveProfile(); sfx.click();
    }, { tip: g.kind === "hat" ? ["HATS", "Villagers wear the hats you have found, or none."] : ["PAVE HERE", `Lay this island's cobbles as *${g.name}*; again for plain cobbles.`] });
    buttonBox(gx, gy, gw, 14, { hover: hv, pressed: pressed("cx:gift", hv) || on });
    text(label, gx + gw / 2, gy + 3 + (pressed("cx:gift", hv) || on ? 1 : 0), { font: "caps", colour: on ? C.gold : C.text, align: "center" });
  }
  if (open) {
    const sw = 64, sx = cx + cw - sw, sy = y + h - 18;
    hv = hotspot(sx, sy, sw, 14, "cx:show", () => { closeCodex(); tutReplay(page.lesson); });
    buttonBox(sx, sy, sw, 14, { hover: hv, pressed: pressed("cx:show", hv), accent: C.gold });
    text("SHOW ME", sx + sw / 2, sy + 3 + (pressed("cx:show", hv) ? 1 : 0), { font: "caps", colour: C.gold, align: "center" });
  }
}

function codexTab(p, x, y, w, h, wide) {
  const on = ui.codex.page === p.id, id = "cx:" + p.id, open = pageOpen(p);
  const hv = hotspot(x, y, w, h, id, () => (ui.codex.page = p.id), wide ? {} : { tip: [open ? p.name.toUpperCase() : "???"] });
  buttonBox(x, y, w, h, { hover: hv, pressed: on || pressed(id, hv), disabled: !open && !on });
  const d = on ? 1 : 0;
  if (open && p.secret) secretIcon(p.id, x + (wide ? 10 : w / 2) + d, y + h / 2 + d);
  else if (open && p.icon === "c_field") drawFieldIcon(x + (wide ? 10 : w / 2) + d, y + h / 2 + d, true);
  else if (open && ATLAS.sprites[p.icon]) {
    const [iw, ih] = spriteSize(p.icon), s = Math.max(iw, ih) > h - 2;
    if (!s) spriteC(p.icon, x + (wide ? 10 : w / 2) + d, y + h / 2 + d);
    else { ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, wide ? 17 : w - 4, h - 4); ctx.clip(); spriteC(p.icon, x + (wide ? 10 : w / 2) + d, y + h / 2 + 2 + d); ctx.restore(); }
  } else if (!open) text("?", x + (wide ? 10 : w / 2), y + h / 2 - 3, { font: "caps", colour: C.faint, align: "center" });
  if (wide) { const f = fitLabel(open ? (p.tab || p.name).toUpperCase() : "???", w - 25); text(f.s, x + 21 + d, y + 5 + d, { font: f.font, colour: on ? C.gold : open ? C.dim : C.faint }); }
  if (open && !PROFILE.read.includes(p.id)) rect(x + w - 5, y + 3, 2, 2, C.gold);
}

// the menus zoom with the island (on), or keep their size while only the island zooms
function zoomToggle(x, y, w) {
  const on = PROFILE.menuZoom !== false;
  const hv = hotspot(x, y, w, 13, "cx:zoom", () => { PROFILE.menuZoom = !on; saveProfile(); fitScreen(); clampCamera(); },
    { tip: ["ZOOM MENUS", on ? "The menus zoom with the island (mouse wheel, + and -). Off: only the island zooms." : "Only the island zooms; the menus keep their size."] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: pressed("cx:zoom", hv) });
  text(w > 90 ? "ZOOM MENUS" : "ZOOM UI", x + 5, y + 3, { font: "caps", colour: C.dim });
  text(on ? "ON" : "OFF", x + w - 5, y + 3, { font: "caps", colour: on ? C.green : C.faint, align: "right" });
}
function hintsToggle(x, y, w) {
  const hv = hotspot(x, y, w, 13, "cx:hints", () => { PROFILE.hints = !PROFILE.hints; saveProfile(); },
    { tip: ["HINTS", "The hand and brackets that point out what to do next."] });
  buttonBox(x, y, w, 13, { hover: hv, pressed: pressed("cx:hints", hv) });
  text("HINTS", x + 5, y + 3, { font: "caps", colour: C.dim });
  text(PROFILE.hints ? "ON" : "OFF", x + w - 5, y + 3, { font: "caps", colour: PROFILE.hints ? C.green : C.faint, align: "right" });
}

// ------------------------------------------------------------ illustrations
// Each gets the inner box of the picture frame (sea blue) and animates on `now`.
// They share a tiny iso helper: tiles 32x16 like the real map.

const artTile = (x, y, colour = "#8cc063") => { drawTile(x, y, colour, "solid"); };
function artGrass(b, cols, rows, ox, oy) {
  // a little island of cols x rows tiles; returns the tile->screen function
  const at = (i, j) => [ox + (i - j) * 16, oy + (i + j) * 8];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const [sx, sy] = at(i, j); artTile(sx, sy, (i + j) % 2 ? "#8cc063" : "#86ba5d"); }
  // the front faces
  for (let i = 0; i < cols; i++) { const [sx, sy] = at(i, rows - 1); for (let k = 0; k < 16; k++) rect(sx - 16 + k, sy + 8 + Math.floor((k + 0.5) / 2) + 1, 1, 4, "#a4744a"); }
  for (let j = 0; j < rows; j++) { const [sx, sy] = at(cols - 1, j); for (let k = 16; k < 32; k++) rect(sx - 16 + k, sy + 16 - Math.ceil((k - 15.5) / 2) + 1, 1, 4, "#8c6040"); }
  return at;
}
function artWalker(x, y, look = 5, carry = null, flip = false) { drawVillager(look, x, y, Math.floor(now * 7) % 2, flip, carry); }
const artLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function artPath(sx, sy, colour) { drawTile(sx, sy, colour, "6"); }

function artBuilding(b) {
  const at = artGrass(b, 3, 3, b.x + b.w / 2 - 20, b.y + 14);
  const ph = (now * 0.5) % 1, [sx, sy] = at(1, 1);
  // a card, the hand taps it, then the tile
  const cx = b.x + 12, cy = b.y + b.h - 34;
  buttonBox(cx, cy, 26, 32, { pressed: ph > 0.1 && ph < 0.5 });
  spriteC("c_cottage", cx + 13, cy + 12);
  text("4", cx + 13, cy + 23, { colour: C.wood, align: "center" });
  if (ph >= 0.5) spriteB("cottage", sx, sy + 14);
  else if (ph >= 0.3) { drawTile(sx, sy, C.green, "edge"); ctx.globalAlpha = 0.65; spriteB("cottage", sx, sy + 14); ctx.globalAlpha = 1; }
  if (ph < 0.3) drawHand(cx + 13, cy + 14, ph > 0.1 && ph < 0.2);
  else if (ph < 0.55) drawHand(sx, sy + 9, ph > 0.45);
}

function artDays(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 16, b.y + 30);
  const [hx, hy] = at(0, 0), [fx, fy] = at(3, 1);
  drawTile(fx, fy, "#e8c24e", "solid");
  spriteB("cottage", hx, hy + 14);
  const ph = (now * 0.25) % 1;
  // the sun crosses the sky; the villager goes out and back
  const sa = Math.PI * (1 - ph);
  rect(Math.round(b.x + b.w / 2 + Math.cos(sa) * (b.w / 2 - 12)), Math.round(b.y + 28 - Math.sin(sa) * 22), 5, 5, C.gold);
  const t = ph < 0.45 ? ph / 0.45 : ph < 0.55 ? 1 : 1 - (ph - 0.55) / 0.45;
  if (ph < 0.45 || ph > 0.55) { const [x, y] = artLerp([hx + 6, hy + 14], [fx - 4, fy + 10], t); artWalker(x, y, 9, ph > 0.5 ? "food" : null, ph > 0.5); }
  if (ph > 0.45 && ph < 0.6) text("+3", fx, fy - 8, { font: "caps", colour: C.green, align: "center" });
  if (ph > 0.85) { ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = (ph - 0.85) * 5; rect(b.x, b.y, b.w, b.h, "#5a64a8"); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
}

function artHomes(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 16, b.y + 26);
  const [hx, hy] = at(0, 1), [wx, wy] = at(3, 0), [ix, iy] = at(1, 0);
  spriteB("cottage", hx, hy + 14);
  spriteB("woodcutter", wx, wy + 14);
  spriteB("hearth", ix, iy + 13);
  icon("bed", hx - 12, hy - 22, C.text); icon("bed", hx + 2, hy - 22, C.text);
  const ph = (now * 0.35) % 1;
  const [x1, y1] = artLerp([hx + 4, hy + 14], [wx - 4, wy + 12], ph);
  artWalker(x1, y1, 3);
  const [x2, y2] = artLerp([hx + 4, hy + 14], [ix + 4, iy + 12], Math.min(1, ph * 2));
  artWalker(x2, y2, 12);
  if (ph > 0.5) text("idle", ix, iy - 8, { colour: C.dim, align: "center" });
}

function artGrowth(b) {
  const at = artGrass(b, 3, 2, b.x + b.w / 2 - 30, b.y + 22);
  const [hx, hy] = at(1, 0);
  spriteB("cottage", hx, hy + 14);
  const ph = (now * 0.3) % 1, bx = b.x + b.w - 20 - Math.min(1, ph * 2) * 40, by = b.y + b.h - 16;
  spriteB("boat", bx, by + Math.round(Math.sin(now * 3)), true);
  if (ph < 0.5) drawVillager(7, bx - 2, by - 5, 0, false, null);
  else { const [x, y] = artLerp([bx - 12, by - 8], [hx + 4, hy + 14], Math.min(1, (ph - 0.5) * 3)); artWalker(x, y, 7, null, true); }
  spriteC("i_food", b.x + 12, b.y + 12);
  text("-3", b.x + 20, b.y + 8, { font: "caps", colour: C.red });
  if (ph > 0.5) text("+1", hx + 14, hy - 12, { font: "caps", colour: C.green });
}

function artGoals(b) {
  const ph = (now * 0.3) % 1, k = Math.min(1, ph * 1.4);
  const gx = b.x + 10, gy = b.y + 14, gw = b.w - 20;
  text("AT 7", gx, gy - 9, { font: "caps", colour: C.dim });
  text("MARKET", gx + gw, gy - 9, { font: "caps", colour: C.gold, align: "right" });
  slotBox(gx, gy, gw, 7);
  rect(gx + 2, gy + 2, Math.round((gw - 4) * k), 3, C.green);
  if (k >= 1) {
    const x = b.x + b.w / 2 - 13, y = b.y + 34 - Math.round(Math.max(0, 1 - (ph - 0.72) * 6) * 8);
    buttonBox(x, y, 26, 32);
    spriteC("c_market", x + 13, y + 12);
    text("5", x + 13, y + 23, { colour: C.wood, align: "center" });
    cueWord("NEW", x + 30, y + 10);
  }
}

function artCamera(b) {
  const off = Math.round(Math.sin(now * 1.2) * 14);
  const at = artGrass(b, 3, 3, b.x + b.w / 2 - 16 + off, b.y + 12);
  const [sx, sy] = at(1, 1);
  spriteB("lighthouse", sx, sy + 14);
  drawHand(b.x + b.w / 2 + 30 + off, b.y + 44, true);
}

function artDesire(b) {
  const labels = [["grass", "1"], ["trail", "0.8"], ["path", "0.6"], ["cobbles", "0.4"]];
  const g = Math.min(4, labels.length), step = Math.floor((b.w - 16) / g);
  labels.forEach(([name, cost], i) => {
    const x = b.x + 8 + step * i + step / 2, y = b.y + 26;
    // a single tile worn to level i, painted with the real path pixels
    for (let py = 0; py < 16; py++) for (let px = 0; px < 32; px++) {
      if (!inDiamond(px, py)) continue;
      const u = ((py + 0.5) / 8 + (px + 0.5 - 16) / 16) / 2, v = ((py + 0.5) / 8 - (px + 0.5 - 16) / 16) / 2;
      let c = (px + py) % 9 ? T.grass : T.grassLt;
      if (i > 0) { const m = pathMask(u, v, [0, 0.13, 0.19, 0.23][i], [true, false, true, false]); if (m >= 0) c = pathPixel(i, m, px + i * 32, py); }
      rect(x - 16 + px, y + py, 1, 1, "rgb(" + c.join(",") + ")");
    }
    text(name, x, y + 20, { colour: C.text, align: "center" });
    text(cost, x, y + 30, { font: "caps", colour: C.gold, align: "center" });
  });
  const ph = (now * 0.2) % 1;
  artWalker(b.x + 8 + ph * (b.w - 16), b.y + 34, 4, null, false);
}

function artCommute(b) {
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 30);
  const [hx, hy] = at(0, 0), [wx, wy] = at(4, 0);
  spriteB("cottage", hx, hy + 14);
  spriteB("woodcutter", wx, wy + 14);
  const worn = Math.floor(now * 0.25) % 2;
  for (let i = 1; i < 4; i++) { const [sx, sy] = at(i, 0); if (worn) artPath(sx, sy, "#cfa66a"); }
  const ph = (now * (worn ? 0.6 : 0.35)) % 1;
  const [x, y] = artLerp([hx + 6, hy + 12], [wx - 6, wy + 10], ph);
  artWalker(x, y, 2);
  text(worn ? "walk 2.9" : "walk 4.5", b.x + b.w / 2, b.y + 6, { font: "caps", colour: worn ? C.green : C.gold, align: "center" });
  text(worn ? "rested" : "long walks tire", b.x + b.w / 2, b.y + b.h - 11, { colour: worn ? C.green : C.red, align: "center" });
}

function artFootfall(b) {
  const at = artGrass(b, 5, 2, b.x + 30, b.y + 18);
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 1); artPath(sx, sy, "#cfa66a"); }
  const [mx, my] = at(2, 0);
  spriteB("market", mx, my + 14);
  for (let k = 0; k < 3; k++) {
    const ph = (now * 0.3 + k / 3) % 1, [x, y] = artLerp(at(0, 1), at(4, 1), ph);
    artWalker(x, y + 9, k * 5 + 1);
    if (Math.abs(ph - 0.5) < 0.06) { spriteC("i_coin", mx + 10, my - 18 - (ph - 0.44) * 60); }
  }
}

function artSteering(b) {
  const at = artGrass(b, 5, 3, b.x + b.w / 2 - 32, b.y + 8);
  const path = [[0, 1], [1, 1], [1, 0], [2, 0], [3, 0], [3, 1], [4, 1]];
  for (const [i, j] of path) { const [sx, sy] = at(i, j); artPath(sx, sy, "#cfa66a"); }
  const [tx, ty] = at(2, 1); spriteB("pine", tx, ty + 11);
  const [t2x, t2y] = at(2, 2); spriteB("tree", t2x, t2y + 11);
  const ph = (now * 0.25) % 1, seg = ph * (path.length - 1), k = Math.floor(seg);
  const [x, y] = artLerp(at(...path[k]), at(...path[Math.min(k + 1, path.length - 1)]), seg - k);
  artWalker(x, y + 9, 6);
}

function artField(b) {
  const at = artGrass(b, 3, 2, b.x + b.w / 2 - 16, b.y + 20);
  const vals = ["+4", "+5", "+4"];
  for (let i = 0; i < 3; i++) {
    const [sx, sy] = at(i, 0);
    for (let py = 0; py < 16; py++) for (let px = 0; px < 32; px++) {
      if (!inDiamond(px, py)) continue;
      const v = ((py + 0.5) / 8 - (px + 0.5 - 16) / 16) / 2;
      rect(sx - 16 + px, sy + py, 1, 1, Math.floor(v * 7) % 2 ? "#9a6a3c" : (px + py) % 6 ? "#e8c24e" : "#f6de84");
    }
    text(vals[i], sx, sy - 8 - (Math.floor(now * 2 + i) % 2), { font: "caps", colour: C.green, align: "center" });
  }
}

function artCutter(b) {
  const at = artGrass(b, 5, 3, b.x + b.w / 2 - 32, b.y + 8);
  const [cx, cy] = at(2, 1);
  const trees = [[0, 0, "pine"], [1, 0, "tree"], [4, 0, "pine"], [0, 2, "birch"], [3, 2, "pine"], [4, 1, "tree"]];
  const lit = Math.floor(now * 2) % (trees.length + 2);
  trees.forEach(([i, j, s], k) => { const [sx, sy] = at(i, j); if (k < lit) drawTile(sx, sy, C.gold, "edge"); spriteB(s, sx, sy + 11); });
  spriteB("woodcutter", cx, cy + 14);
  text(`+${Math.min(4, Math.floor(Math.min(lit, trees.length) / 2))}`, cx, cy - 22, { font: "caps", colour: C.green, align: "center" });
}

function artFisher(b) {
  const at = artGrass(b, 2, 2, b.x + 30, b.y + 18);
  const [sx, sy] = at(1, 1);
  spriteB("fisher", sx, sy + 14);
  // a fish jumps now and then
  const ph = (now * 0.6) % 1;
  if (ph < 0.4) { const fx = b.x + b.w - 40 + ph * 30, fy = b.y + b.h - 18 - Math.sin(ph / 0.4 * Math.PI) * 14; rect(Math.round(fx), Math.round(fy), 3, 2, "#a8d0e8"); }
  text("+4", sx, sy - 22, { font: "caps", colour: C.green, align: "center" });
}

function artBridge(b) {
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 30);
  const [rx, ry] = at(2, 0);
  drawTile(rx, ry, "#5ab0cf", "solid");
  for (let k = 0; k < 7; k++) drawTile(rx, ry, "#c49460", "4");
  const ph = (now * 0.3) % 1, [x, y] = artLerp(at(0, 0), at(4, 0), ph);
  artWalker(x, y + 9, 8);
  const [tx, ty] = at(4, 0); spriteB("tree", tx + 6, ty + 5);
}

function artWell(b) {
  const at = artGrass(b, 3, 3, b.x + b.w / 2 - 16, b.y + 4);
  const [wx, wy] = at(1, 1);
  const homes = [[0, 1], [2, 1], [1, 2]];
  homes.forEach(([i, j]) => { const [sx, sy] = at(i, j); spriteB("cottage", sx, sy + 14); icon("bed", sx + 4, sy - 20, Math.floor(now * 2) % 2 ? C.gold : C.text); });
  spriteB("well", wx, wy + 13);
}

function artTavern(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 16, b.y + 18);
  const [tx, ty] = at(1, 0);
  spriteB("tavern", tx, ty + 15);
  lightPool(tx, ty + 12, 22, "#ffc060", 0.9); spriteB("tavern_lit", tx, ty + 15);
  for (let k = 0; k < 3; k++) {
    const ph = (now * 0.35 + k / 3) % 1, [x, y] = artLerp(at(3, 1), at(1, 0), ph);
    artWalker(x, y + 9, k * 7 + 2, "coin", true);
  }
  text("+1 +1 +1", tx, ty - 24, { font: "caps", colour: C.gold, align: "center" });
}

function artJobs(b) {
  const at = artGrass(b, 5, 2, b.x + b.w / 2 - 48, b.y + 16);
  const [hx, hy] = at(0, 1), [fx, fy] = at(2, 0), [wx, wy] = at(4, 1);
  drawTile(fx, fy, "#e8c24e", "solid");
  spriteB("cottage", hx, hy + 14);
  spriteB("workshop", wx, wy + 14);
  // two walk to the field, then two more on to the workshop
  for (let k = 0; k < 4; k++) {
    const ph = Math.min(1, ((now * 0.3) % 1) * 1.6 - k * 0.12), to = k < 2 ? [fx, fy + 8] : [wx - 4, wy + 10];
    if (ph > 0) { const [x, y] = artLerp([hx + 6, hy + 14], to, ph); artWalker(x + k * 2, y, k * 4 + 1); }
  }
  text("1st jobs first", fx, fy - 10, { colour: C.dim, align: "center" });
  icon("hand", b.x + 8, b.y + b.h - 12, C.sky); text("1", b.x + 16, b.y + b.h - 13, { colour: C.text });
}

function artSites(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 32, b.y + 22);
  const [sx, sy] = at(2, 0), [hx, hy] = at(0, 1), ph = (now * 0.25) % 1;
  spriteB("cottage", hx, hy + 14);
  if (ph < 0.75) {
    spriteB("scaffold", sx, sy + 14);
    const done = Math.floor(ph / 0.25), w = 14;
    rect(sx - w / 2 - 1, sy - 22, w + 2, 4, C.ink); rect(sx - w / 2, sy - 21, w, 2, C.winLo); rect(sx - w / 2, sy - 21, Math.round(w * done / 3), 2, C.gold);
    const t = (ph % 0.25) / 0.25, [x, y] = artLerp([hx + 6, hy + 14], [sx - 6, sy + 12], t);
    artWalker(x, y, 11, "wood");
  } else {
    spriteB("workshop", sx, sy + 14);
    text("BUILT", sx, sy - 26, { font: "caps", colour: C.gold, align: "center" });
  }
}

function artSleep(b) {
  const ph = (now * 0.4) % 1, d = 12 + Math.floor(ph * 5);
  rect(b.x, b.y, b.w, b.h, "#2a3a68");
  icon("moon", b.x + 14, b.y + 12, C.gold);
  text(`DAY ${d}`, b.x + b.w / 2, b.y + 28, { font: "big", colour: C.gold, align: "center" });
  if (ph > 0.8) text("A NEWCOMER", b.x + b.w / 2, b.y + 56, { font: "caps", colour: C.green, align: "center" });
  else text("z z z", b.x + b.w / 2 + Math.sin(now * 3) * 4, b.y + 56, { font: "caps", colour: C.dim, align: "center" });
}

function artWorkshop(b) {
  const at = artGrass(b, 3, 2, b.x + b.w / 2 - 16, b.y + 20);
  const [sx, sy] = at(1, 0), ph = (now * 0.5) % 1;
  spriteB("workshop", sx, sy + 14);
  spriteC("i_wood", sx - 30 + Math.min(1, ph * 2) * 20, sy - 8);
  if (ph > 0.5) for (let k = 0; k < R.goods.perWood; k++) spriteC("i_goods", sx + 12 + k * 10, sy - 12 - (ph - 0.5) * 12);
  text(`1 > ${R.goods.perWood}`, sx, sy - 26, { font: "caps", colour: C.green, align: "center" });
}

function artHouse(b) {
  const at = artGrass(b, 3, 2, b.x + b.w / 2 - 16, b.y + 26);
  const [sx, sy] = at(1, 0), ph = Math.floor(now * 0.8) % 4;
  spriteB("house", sx, sy + 14);
  const needs = [["shop", "market", C.red], ["crate", "goods", C.goods], ["mug", "company", C.sky]];
  needs.forEach(([ic, name, col], k) => {
    const x = b.x + 10, y = b.y + 10 + k * 12, ok = k < ph;
    bevel(x, y, 11, 10, "#10142a", C.winHi, C.ink); icon(ic, x + 3, y + 2, col);
    text(name, x + 14, y + 2, { colour: ok ? C.green : C.dim });
  });
  const beds = ph >= 3 ? 6 : 4;
  for (let k = 0; k < beds; k++) icon("bed", b.x + b.w - 14 - (k % 3) * 7, b.y + 10 + Math.floor(k / 3) * 7, k >= 4 ? C.gold : C.text);
}

function artStreet(b) {
  const at = artGrass(b, 5, 1, b.x + b.w / 2 - 64, b.y + 36);
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 0); artPath(sx, sy, "#c9c1b2"); }
  [["stall", 1], ["bench", 2], ["lamp", 3], ["flowers", 4]].forEach(([n, i]) => { const [sx, sy] = at(i, 0); spriteB(n, sx, sy + 12); });
  const ph = (now * 0.2) % 1, [x, y] = artLerp(at(0, 0), at(4, 0), ph);
  artWalker(x, y + 9, 5);
  const [cx, cy] = at(1, 0);
  if (Math.abs(ph - 0.25) < 0.06) spriteC("i_coin", cx + 8, cy - 14 - (ph - 0.19) * 60);
}

function artShip(b) {
  const at = artGrass(b, 3, 1, b.x + 20, b.y + 40);
  const [cx, cy] = at(1, 0);
  spriteB("cottage", cx, cy + 14);
  const ph = (now * 0.25) % 1, x = b.x + b.w - 30 - Math.max(0, ph - 0.5) * 2 * (b.w - 40);
  spriteB("ship", x, b.y + b.h - 6 + Math.round(Math.sin(now * 2)), true);
}
function artChart(b) {
  rect(b.x, b.y, b.w, b.h, "#e6d6b0");
  const pts = [[0.15, 0.5], [0.45, 0.3], [0.45, 0.72], [0.78, 0.5]];
  dottedLine(b.x + b.w * pts[0][0], b.y + b.h * pts[0][1], b.x + b.w * pts[1][0], b.y + b.h * pts[1][1], "#5a4630", 3);
  dottedLine(b.x + b.w * pts[0][0], b.y + b.h * pts[0][1], b.x + b.w * pts[2][0], b.y + b.h * pts[2][1], "#b8a888", 3);
  dottedLine(b.x + b.w * pts[1][0], b.y + b.h * pts[1][1], b.x + b.w * pts[3][0], b.y + b.h * pts[3][1], "#5a4630", 2);
  pts.forEach(([u, v], i) => { const x = b.x + b.w * u, y = b.y + b.h * v; rect(x - 6, y - 4, 12, 8, i === 2 ? "#c8b898" : "#8cc063"); if (i === 1 && Math.floor(now * 2) % 2) brackets(x - 6, y - 4, 12, 8); });
}
function artBoons(b) {
  const names = [BOONS[0], BOONS[4]], ph = Math.floor(now * 0.7) % 2;
  names.forEach((bn, i) => {
    const w = Math.floor(b.w / 2) - 10, x = b.x + 6 + i * (w + 8), y = b.y + 10;
    bevel(x, y, w, 60, i === ph ? "#3b4670" : C.win, i === ph ? C.gold : C.winHi, C.winLo);
    text(bn.name.toUpperCase(), x + w / 2, y + 5, { font: "caps", colour: i === ph ? C.gold : C.text, align: "center" });
    wrap(bn.desc, w - 10).forEach((l, k) => rich(l, x + 5, y + 17 + k * 9, C.dim));
  });
}
function artTribute(b) {
  const at = artGrass(b, 3, 1, b.x + 24, b.y + 40);
  const [hx, hy] = at(2, 0);
  spriteB("harbour", hx, hy + 15);
  const ph = (now * 0.3) % 1, x = b.x + 8 + Math.min(1, ph * 1.6) * (b.w * 0.4);
  spriteB("boat", x, b.y + b.h - 8 + Math.round(Math.sin(now * 3)), false);
  rect(x - 3, b.y + b.h - 22, 5, 4, C.ink); rect(x - 2, b.y + b.h - 21, 3, 2, "#c49460");
  if (ph > 0.65) text("TRIBUTE", hx, hy - 22, { font: "caps", colour: C.gold, align: "center" });
}
function artStony(b) {
  const at = artGrass(b, 5, 2, b.x + b.w / 2 - 48, b.y + 18);
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 1); drawTile(sx, sy, "#a8a48c", "solid"); }
  const [qx, qy] = at(1, 0), [rx, ry] = at(2, 0), [kx, ky] = at(0, 0);
  spriteB("boulders", kx, ky + 12); spriteB("rock", rx, ry + 11); spriteB("quarry", qx, qy + 14);
  const ph = Math.floor(now * 1.5) % 4;
  for (let i = 0; i < ph; i++) { const [sx, sy] = at(4 - i, 1); drawTile(sx, sy, "#c9c1b2", "solid"); }
}
function artMarsh(b) {
  const at = artGrass(b, 5, 2, b.x + b.w / 2 - 48, b.y + 18);
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 1); drawTile(sx, sy, "#6f8a4a", "solid"); drawTile(sx, sy, "#5f8f98", "4"); }
  for (let i = 1; i < 4; i++) { const [sx, sy] = at(i, 1); if (i <= 1 + Math.floor(now) % 3) for (let k = 0; k < 3; k++) drawTile(sx, sy, "#c49460", "6"); }
  const [cx, cy] = at(2, 0), [wx, wy] = at(4, 0), [ex, ey] = at(0, 1);
  spriteB("claypit", cx, cy + 14); spriteB("willow", wx, wy + 11); spriteB("reeds", ex, ey + 11);
}
function artRuins(b) {
  const at = artGrass(b, 5, 2, b.x + b.w / 2 - 48, b.y + 18);
  for (let i = 0; i < 4; i++) { const [sx, sy] = at(i, 1); artPath(sx, sy, "#b8b2a2"); }
  const [rx, ry] = at(4, 1), [px, py] = at(3, 0);
  spriteB("ruin", rx, ry + 13); spriteB("pillar", px, py + 11);
  if (Math.floor(now * 0.5) % 2) { rect(rx + 6, ry - 14, 1, 12, C.ink); rect(rx + 7, ry - 14, 5, 3, C.gold); text("+25", rx, ry - 26, { font: "caps", colour: C.gold, align: "center" }); }
  const ph = (now * 0.25) % 1, [x, y] = artLerp(at(0, 1), at(3, 1), ph);
  artWalker(x, y + 9, 3);
}

// ---- weather
function artSeasons(b) {
  const step = Math.floor((b.w - 16) / 4), cur = Math.floor(now * 0.7) % 4;
  SEASONS.forEach((s, i) => {
    const x = Math.round(b.x + 8 + step * i + step / 2), y = b.y + 30;
    for (let py = 0; py < 16; py++) for (let px = 0; px < 32; px++) {
      if (!inDiamond(px, py)) continue;
      const h = hash(px + i * 40, py, 3);
      const c = i === 3 ? (h < 0.06 ? T.snowDk : T.snow) : i === 2 ? (h > 0.94 ? T.leaf[(h * 30) % 3 | 0] : T.autumn) : i === 0 && h > 0.93 ? T.flower[(h * 40) % 3 | 0] : T.grass;
      rect(x - 16 + px, y + py, 1, 1, "rgb(" + c.join(",") + ")");
    }
    spriteB(i === 3 && ATLAS.sprites.tree_snow ? "tree_snow" : i === 2 && ATLAS.sprites.tree_autumn ? "tree_autumn" : "tree", x, y + 10);
    wxIcon(s, x - 4, y - 26);
    if (i === cur) brackets(x - 12, y - 28, 24, 13);
    text(s, x, y + 20, { colour: i === cur ? C.gold : C.text, align: "center" });
  });
}
function artWinter(b) {
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 30);
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 0); drawTile(sx, sy, "#eef3f7", "solid"); }
  const ph = (now * 0.2) % 1, [x0, y0] = at(0, 0), [x1, y1] = at(4, 0);
  // prints behind the walker stay in the snow
  for (let k = 0; k < 24 && k / 24 < ph; k++) { const [px, py] = artLerp([x0, y0 + 9], [x1, y1 + 9], k / 24); rect(Math.round(px) + (k % 2 ? 1 : -1), Math.round(py) + (k % 2), 1, 1, "#a9b8c8"); }
  const [x, y] = artLerp([x0, y0 + 9], [x1, y1 + 9], ph);
  artWalker(x, y, 6);
  const [fx, fy] = at(2, 0);
  spriteB(ATLAS.sprites.fisher_snow ? "fisher_snow" : "fisher", fx + 40, fy - 6);
  text("fields rest", b.x + b.w / 2, b.y + 6, { font: "caps", colour: C.sky, align: "center" });
}
function artStorms(b) {
  rect(b.x, b.y, b.w, b.h, "#3e7c98");
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 34), ph = Math.floor(now * 1.2) % 2;
  const cols = ["#6fb8cf", "#6fb8cf", "#9a948a", "#e8c24e", "#e8c24e"];
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 0); drawTile(sx, sy, cols[i], "solid"); if (i < 2 && ph) drawTile(sx, sy, "#a6dbe6", "4"); }
  const [wx0, wy0] = at(2, 0);
  text("wall", wx0, wy0 - 8, { colour: C.text, align: "center" });
  text("flooded", at(0, 0)[0] + 16, at(0, 0)[1] - 8, { colour: C.sky, align: "center" });
  text("dry", at(4, 0)[0], at(4, 0)[1] - 8, { colour: C.green, align: "center" });
  ctx.fillStyle = "#d8e8f4";
  for (let k = 0; k < 40; k++) ctx.fillRect(b.x + Math.floor(hash(k, 1, 40) * b.w + now * 20) % b.w, b.y + Math.floor(hash(k, 2, 40) * b.h + now * 120) % b.h, 1, 3);
}
function artTides(b) {
  const out = Math.floor(now * 0.3) % 2 === 0, at = artGrass(b, 1, 1, b.x + 22, b.y + 34);
  for (let i = 1; i < 4; i++) { const [sx, sy] = at(i, 0); drawTile(sx, sy, out ? "#e6d49a" : "#78c7cf", "solid"); if (!out) drawTile(sx, sy, "#b9b48e", "4"); }
  const [ix, iy] = at(4, 0);
  drawTile(ix, iy, "#e6d49a", "solid"); spriteB("dunegrass", ix, iy + 11);
  text(out ? "tide out" : "tide in", b.x + b.w / 2, b.y + 6, { font: "caps", colour: out ? C.gold : C.sky, align: "center" });
  if (out) { const [x, y] = artLerp(at(0, 0), at(4, 0), (now * 0.3 % 1)); artWalker(x, y + 9, 3); }
}
function artThreats(b) {
  const at = artGrass(b, 3, 1, b.x + 20, b.y + 36), [fx, fy] = at(1, 0);
  drawTile(fx, fy, "#e8c24e", "solid");
  // a gull dives at the field
  const t = (now * 0.8) % 1, gx = Math.round(fx - 20 + t * 30), gy = Math.round(fy - 20 + Math.sin(t * Math.PI) * 14);
  rect(gx - 2, gy, 2, 1, "#ffffff"); rect(gx + 1, gy, 2, 1, "#ffffff"); rect(gx, gy + 1, 1, 1, "#ffffff");
  text("-2", fx, fy - 10, { font: "caps", colour: C.red, align: "center" });
  // the serpent's coils behind a boat
  const bx = b.x + b.w - 40, by = b.y + b.h - 14;
  spriteB("boat", bx, by + Math.round(Math.sin(now * 3)), true);
  for (let k = 0; k < 3; k++) { const cx = bx - 26 + k * 7, cy = by - 2 + (Math.floor(now * 3 + k) % 2); rect(cx, cy - 2, 5, 2, "#3a7a3a"); rect(cx + 1, cy - 3, 3, 1, "#6ab04a"); }
}
function artRise(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 32, b.y + 22), ph = (now * 0.3) % 1;
  const [cx, cy] = at(3, 1);
  if (ph < 0.5) spriteB("cottage", cx, cy + 14);
  for (let i = 0; i < 4; i++) { const [sx, sy] = at(i, 1); if (ph >= 0.5) drawTile(sx, sy, "#4a9fc0", "solid"); }
  if (ph >= 0.5) text("+4 wood", cx, cy - 10, { font: "caps", colour: C.wood, align: "center" });
}
function artHighlands(b) {
  const at = artGrass(b, 5, 1, b.x + 20, b.y + 50);
  for (let i = 0; i < 5; i++) {
    const [sx, sy] = at(i, 0), lift = i * 6;
    drawTile(sx, sy - lift, "#a2bc72", "solid");
    rect(sx - 16, sy - lift + 8, 16, lift + 1, "#a4744a"); rect(sx, sy - lift + 8, 16, lift + 1, "#8c6040");
    drawTile(sx, sy - lift, "#8cc063", "solid");
  }
  const [px, py] = at(4, 0);
  spriteB("fir", px, py - 24 + 11);
  const t = (now * 0.25) % 1, [x, y] = artLerp(at(0, 0), at(3, 0), t);
  drawSheep(x, y + 8 - t * 18, Math.floor(now * 5) % 2, false);
  text("uphill costs more", b.x + b.w / 2, b.y + 6, { colour: C.dim, align: "center" });
}
function artTidal(b) {
  const at = artGrass(b, 2, 1, b.x + 26, b.y + 36);
  for (let i = 2; i < 5; i++) { const [sx, sy] = at(i, 0); drawTile(sx, sy, "#e6d49a", "solid"); }
  const [px, py] = at(1, 0);
  spriteB("pier", px, py + 15);
  const [dx, dy] = at(4, 0); spriteB("driftwood", dx, dy + 11);
  if (Math.floor(now) % 2) text("+2", px, py - 22, { font: "caps", colour: C.gold, align: "center" });
}
function artStormCoast(b) {
  const at = artGrass(b, 4, 1, b.x + 22, b.y + 36);
  const [wx0, wy0] = at(3, 0); drawTile(wx0, wy0, "#9a948a", "solid");
  const [tx, ty] = at(1, 0); spriteB("windpine", tx, ty + 11);
  spriteB("seastack", b.x + b.w - 26, b.y + b.h - 8);
  spriteB("gorse", at(2, 0)[0], at(2, 0)[1] + 11);
}
function artSnowNorth(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 32, b.y + 22);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) { const [sx, sy] = at(i, j); drawTile(sx, sy, "#eef3f7", "solid"); }
  const [lx, ly] = at(1, 0), [sx, sy] = at(3, 0), [cx, cy] = at(2, 1);
  spriteB("lodge", lx, ly + 14); spriteB("spruce_snow", sx, sy + 11); spriteB(ATLAS.sprites.cottage_snow ? "cottage_snow" : "cottage", cx, cy + 14);
  icon("bed", cx + 6, cy - 22, Math.floor(now * 2) % 2 ? C.gold : C.text);
}

// ---- moments
function artStranger(b) {
  const at = artGrass(b, 6, 1, b.x + 20, b.y + 38), ph = (now * 0.25) % 1;
  // footprints from the shore (left) to the hut among the trees
  for (let i = 0; i < 4; i++) { const [sx, sy] = at(i, 0); for (let k = 0; k < 4; k++) rect(sx - 8 + k * 5, sy + 7 + (k % 2), 1, 1, "#7b5a36"); }
  const [hx, hy] = at(5, 0), [tx, ty] = at(4, 0);
  spriteB("pine", tx + 8, ty + 4); spriteB("hermit", hx, hy + 14);
  if (ph < 0.6) { const bob = Math.floor(now * 2) % 2; bevel(hx - 6, hy - 38 - bob, 13, 11, "#10142a", C.winHi, C.ink); text("?", hx + 1, hy - 36 - bob, { font: "caps", colour: C.gold, align: "center" }); }
  const [x, y] = artLerp(at(0, 0), at(4, 0), Math.min(1, ph * 1.4));
  artWalker(x, y + 9, 6);
  if (ph > 0.72) text("a boon!", hx, hy - 34, { font: "caps", colour: C.gold, align: "center" });
}
function artHerd(b) {
  const at = artGrass(b, 6, 2, b.x + b.w / 2 - 80, b.y + 16), ph = (now * 0.2) % 1;
  for (let i = 0; i < 6; i++) { const [sx, sy] = at(i, 1); if (i / 6 < ph + 0.1) artPath(sx, sy, "#b89a6a"); }
  const [tx, ty] = at(3, 0); spriteB("tree", tx, ty + 11); spriteB("pine", at(4, 0)[0], at(4, 0)[1] + 11);
  for (let k = 0; k < 4; k++) { const t = Math.max(0, Math.min(1, ph * 1.3 - k * 0.08)), [x, y] = artLerp(at(0, 1), at(5, 1), t); drawDeer(x + 16, y + 9 + (k % 2) * 2, Math.floor(now * 6 + k) % 2, false); }
  text("trees turn the herd", b.x + b.w / 2, b.y + 4, { colour: C.dim, align: "center" });
}
function artMerchant(b) {
  rect(b.x, b.y, b.w, b.h, "#2a3a68");
  const at = artGrass(b, 5, 1, b.x + 24, b.y + 40);
  for (let i = 0; i < 5; i++) { const [sx, sy] = at(i, 0); artPath(sx, sy, "#9a948a"); }
  const [tx, ty] = at(4, 0), [cx, cy] = at(3, 0);
  spriteB("tavern", tx, ty + 15); spriteB("tavern_lit", tx, ty + 15);
  for (const i of [0, 2]) { const [lx, ly] = at(i, 0); spriteB("lamp", lx, ly + 12); lightPool(lx, ly + 10, 16, "#ffd890", 0.9); rect(lx - 1, ly + 12 - spriteSize("lamp")[1] + 2, 3, 3, "#ffd890"); }
  const ph = (now * 0.3) % 1, sx = b.x + 8 + Math.min(1, ph * 2) * 30;
  spriteB("boat", sx, b.y + b.h - 6 + Math.round(Math.sin(now * 3)), false);
  if (ph > 0.5) { spriteB("merchant", cx, cy + 13); text("+ WARES", cx, cy - 20, { font: "caps", colour: C.gold, align: "center" }); }
}
function artFeast(b) {
  const at = artGrass(b, 5, 3, b.x + b.w / 2 - 16, b.y + 4), [hx, hy] = at(2, 1);
  for (const [i, j] of [[0, 1], [1, 1], [3, 1], [4, 1], [2, 0], [2, 2]]) { const [sx, sy] = at(i, j); drawTile(sx, sy, "#cbc3b2", "6"); drawTile(sx, sy, "#dcd4c4", "3"); }
  spriteB("hearth", hx, hy + 13); flame(hx, hy + 4, 1);
  for (let k = 0; k < 4; k++) { const ph = (now * 0.3 + k / 4) % 1, from = at(...[[0, 1], [4, 1], [2, 0], [2, 2]][k]), [x, y] = artLerp(from, [hx, hy], ph * 0.8); artWalker(x, y + 9, k * 3 + 2); }
  // fireworks: sparks in flat pixels
  for (let k = 0; k < 12; k++) { const t = (now * 0.8 + k * 0.37) % 1, a = k * 2.4; if (t < 0.6) rect(Math.round(b.x + b.w / 2 + (k % 3 - 1) * 40 + Math.cos(a) * t * 16), Math.round(b.y + 14 + Math.sin(a) * t * 10), 1, 1, [C.gold, C.red, C.sky][k % 3]); }
}
function artWreck(b) {
  const out = Math.floor(now * 0.3) % 2 === 0, at = artGrass(b, 1, 1, b.x + 22, b.y + 34);
  for (let i = 1; i < 4; i++) { const [sx, sy] = at(i, 0); drawTile(sx, sy, out ? "#e6d49a" : "#78c7cf", "solid"); if (!out) drawTile(sx, sy, "#b9b48e", "4"); }
  const [wx, wy] = at(3, 0);
  spriteB("wreck", wx, wy + 13);
  if (out) { const [x, y] = artLerp(at(0, 0), at(2, 0), (now * 0.3) % 1); artWalker(x, y + 9, 3); text("+WOOD", wx, wy - 18, { font: "caps", colour: C.wood, align: "center" }); }
  text(out ? "spring tide" : "tide in", b.x + b.w / 2, b.y + 4, { font: "caps", colour: out ? C.gold : C.sky, align: "center" });
}

// the secret shapes, drawn as a little island of half-size tiles (faint: an unfound
// page): # path, l a lamp on it, h the hearth, b a building, S the shrine, t a tree, ~ sea
const SHAPE_ART = {
  ring: ["#######", "#.....#", "#..h..#", "#.....#", "#######"],
  eight: ["###...", "#.#...", "###...", "..###.", "..#.#.", "..###."],
  spiral: ["#######", "#.....#", "#.###.#", "#.#.#.#", "#.#...#", "#.#####"],
  tour: ["bbbbbbb", "#######", "bbbbbbb"],
  mile: ["############"],
  coast: ["~~~~~~~~~~~", "~.........~", "###########", "~.........~", "~~~~~~~~~~~"],
  lantern: ["#l#l#l#l#l#l#l#l"],
  shrine: [".tt.", "#St.", ".tt."],
};
const MINI_COL = { "#": "#c9c1b2", l: "#c9c1b2", h: "#e0903a", b: "#e08a3a", S: "#a09888", t: "#3a6e3a", ".": "#8cc063" };
function miniTile(sx, sy, colour) {
  ctx.fillStyle = colour;
  for (let r = 0; r < 8; r++) { const hw = r < 4 ? 2 * r + 1 : 15 - 2 * r; ctx.fillRect(sx - hw, sy + r, hw * 2, 1); }
}
function artSecret(b, id, faint) {
  const m = SHAPE_ART[id], rows = m.length, cols = Math.max(...m.map(r => r.length));
  const wide = (cols + rows) * 8, room = faint ? b.w : b.w - 90;
  const ox = Math.round(b.x + room / 2 - wide / 2 + rows * 8), oy = Math.round(b.y + b.h / 2 - ((cols + rows) * 4) / 2);
  m.forEach((row, j) => { for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === "~" || (faint && c === ".")) continue;
    const sx = ox + (i - j) * 8, sy = oy + (i + j) * 4;
    miniTile(sx, sy, faint ? (c === "." ? "#2c3350" : "#4a5478") : MINI_COL[c]);
    if (faint) continue;
    if (c === "l") { rect(sx, sy - 5, 1, 7, C.ink); rect(sx - 1, sy - 6, 3, 2, "#ffd890"); }
    if (c === "h") flame(sx, sy + 4, 1);
    if (c === "b" || c === "S" || c === "t") { rect(sx - 3, sy - 3, 6, 6, C.ink); rect(sx - 2, sy - 2, 4, 5, MINI_COL[c]); }
  } });
  if (faint) return;
  // the gift: villagers in the hat, or a tile laid in the pattern; its name below
  const g = SECRETS.find(s => s.id === id).gift, gx = b.x + b.w - 44, gy = b.y + b.h / 2 + 2;
  if (COSMETICS[g].kind === "hat") {
    [3, 9, 22].forEach((lk, k) => ctx.drawImage(figure(lk, Math.floor(now * 3 + k) % 2, null, g), gx - 16 + k * 12, gy - 12));
  } else {
    const keep = look.pattern;
    look.pattern = g;
    for (let py = 0; py < 16; py++) for (let px = 0; px < 32; px++) if (inDiamond(px, py)) rect(gx - 16 + px, gy - 12 + py, 1, 1, "rgb(" + pathPixel(3, 0.2, px, py).join(",") + ")");
    look.pattern = keep;
  }
  text(COSMETICS[g].name, gx, gy + 8, { colour: C.gold, align: "center" });
}
// a found secret's tab: its shape in miniature
function secretIcon(id, cx, cy) {
  const m = SHAPE_ART[id], rows = m.length, cols = Math.max(...m.map(r => r.length)), cell = cols > 9 ? 1 : 2;
  const x0 = Math.round(cx - (cols * cell) / 2), y0 = Math.round(cy - (rows * cell) / 2);
  m.forEach((row, j) => { for (let i = 0; i < row.length; i++) if ("#lS".includes(row[i])) rect(x0 + i * cell, y0 + j * cell, cell, cell, row[i] === "l" ? C.gold : "#c9c1b2"); });
}

// ---- phase 5
function artChronicle(b) {
  slotBox(b.x + 8, b.y + 6, b.w - 16, b.h - 12);
  const n = 40, k = Math.floor(now * 8) % (n + 12);
  for (let i = 0; i < Math.min(n, k); i++) {
    const x = b.x + 14 + Math.round(((b.w - 28) * i) / n);
    rect(x, Math.round(b.y + b.h - 12 - (b.h - 26) * (1 - Math.exp(-i / 14)) * 0.9), 2, 1, C.green);
    rect(x, Math.round(b.y + b.h - 12 - (b.h - 26) * (0.3 + 0.25 * Math.sin(i / 3)) * 0.7), 2, 1, C.coin);
  }
  for (let i = 0; i < n; i += 10) rect(b.x + 14 + Math.round(((b.w - 28) * (i + 7)) / n), b.y + 10, Math.round((b.w - 28) / n * 3), b.h - 22, "#222a4488");
}
function artTownhall(b) {
  const at = artGrass(b, 4, 2, b.x + b.w / 2 - 32, b.y + 16), [hx, hy] = at(2, 0);
  for (let i = 0; i < 4; i++) artPath(...at(i, 1), "#c9c1b2");
  spriteB(ATLAS.sprites.townhall ? "townhall" : "tavern", hx, hy + 15);
  const ph = (now * 0.3) % 1;
  spriteB("boat", b.x + 8 + ph * 40, b.y + b.h - 6 + Math.round(Math.sin(now * 3)), false);
  if (ph > 0.6) text("+1", hx, hy - 26, { font: "caps", colour: C.green, align: "center" });
  const [x, y] = artLerp(at(0, 1), at(3, 1), (now * 0.25) % 1); artWalker(x, y + 9, 4);
}
function artGrandMarket(b) {
  const at = artGrass(b, 5, 3, b.x + b.w / 2 - 16, b.y + 2), [mx, my] = at(2, 1);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) if (Math.abs(i - 2) <= 2 && (i !== 2 || j !== 1)) drawTile(...at(i, j), C.gold, "2");
  spriteB(ATLAS.sprites.grandmarket ? "grandmarket" : "market", mx, my + 14);
  for (let k = 0; k < 3; k++) { const t = (now * 0.2 + k / 3) % 1, [x, y] = artLerp(at(0, 2 - (k % 2) * 2), at(4, 2 - (k % 2) * 2), t); artWalker(x, y + 9, 3 + k * 4); if (Math.abs(t - 0.5) < 0.05) text("+1", x, y - 6, { font: "caps", colour: C.coin, align: "center" }); }
}
function artReclaim(b) {
  const at = artGrass(b, 3, 2, b.x + 30, b.y + 16), ph = Math.floor(now * 1.2) % 5;
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = at(3 + i, 0);
    if (i < ph) { drawTile(sx, sy, "#8cc063", "solid"); for (let k = 0; k < 16; k++) rect(sx - 16 + k + 16, sy + 16 - Math.ceil(k / 2), 1, 3, "#8c6040"); }
    else drawTile(sx, sy, "#78c7cf", "4");
  }
  spriteB("townhall", ...[at(1, 1)[0], at(1, 1)[1] + 15]);
  text("new land", b.x + b.w / 2, b.y + 4, { colour: C.dim, align: "center" });
}
function artLetters(b) {
  const at = artGrass(b, 3, 1, b.x + 24, b.y + 40), [hx, hy] = at(2, 0);
  spriteB("harbour", hx, hy + 15);
  const ph = (now * 0.25) % 1, out = ph > 0.5, x = out ? hx - 30 - (ph - 0.5) * 2 * 60 : b.x + 10 + ph * 2 * (hx - 40 - b.x - 10);
  spriteB("boat", x, b.y + b.h - 8 + Math.round(Math.sin(now * 3)), out);
  rect(x - 3, b.y + b.h - 22, 5, 4, C.ink); rect(x - 2, b.y + b.h - 21, 3, 2, out ? "#e0c08c" : "#c49460");
  bevel(b.x + 8, b.y + 6, 13, 10, "#f4e8c8", "#fff4dc", "#b8a078"); icon("letter", b.x + 11, b.y + 8, "#9a5a10");
  text(out ? "20 goods home" : "a letter", b.x + 26, b.y + 8, { colour: C.text });
}
function artEndless(b) {
  rect(b.x, b.y, b.w, b.h, "#e6d6b0");
  const n = 7, dx = (b.w - 20) / (n - 1), off = (now * 12) % dx;
  for (let i = 0; i < n + 1; i++) {
    const x = Math.round(b.x + 10 + i * dx - off), y = b.y + b.h / 2 + (i % 2 ? -10 : 10);
    if (i) dottedLine(x - dx, b.y + b.h / 2 + ((i - 1) % 2 ? -10 : 10), x, y, "#5a4630", 3);
    rect(x - 6, y - 4, 12, 8, "#8cc063"); rect(x - 5, y - 3, 10, 1, "#a8c864");
  }
}
function artAtoll(b) {
  const at = artGrass(b, 5, 1, b.x + 20, b.y + 20);
  for (let i = 1; i < 4; i++) { const [sx, sy] = at(i, 0); drawTile(sx, sy, "#6cc8c8", "solid"); drawTile(sx, sy, "#a4e4dc", "3"); }
  const [px, py] = at(0, 0), [ox, oy] = at(4, 0);
  drawTile(px, py, "#e6d49a", "solid"); drawTile(ox, oy, "#e6d49a", "solid");
  spriteB(ATLAS.sprites.ferry ? "ferry" : "pier", px, py + 15); spriteB(ATLAS.sprites.palm ? "palm" : "tree", ox, oy + 11);
  spriteB(ATLAS.sprites.mangrove ? "mangrove" : "willow", at(2, 0)[0] + 14, at(2, 0)[1] + 20);
  const t = (now * 0.2) % 1, k = t < 0.5 ? t * 2 : 2 - t * 2, [x, y] = artLerp(at(1, 0), at(3, 0), k);
  rect(Math.round(x) - 5, Math.round(y) + 9, 10, 2, "#8e6238"); rect(Math.round(x) - 4, Math.round(y) + 8, 8, 1, "#c49460"); artWalker(x, y + 8, 5);
  if (Math.floor(now) % 3 === 0) { spriteC("i_pearl", b.x + b.w - 20, b.y + 12); }
}
function artTwin(b) {
  const at = artGrass(b, 2, 1, b.x + 14, b.y + 30), at2 = artGrass(b, 2, 1, b.x + 14 + 5 * 16, b.y + 30 + 5 * 8);
  const n = Math.floor(now * 0.8) % 5;
  for (let i = 0; i < 3; i++) { const [sx, sy] = at(2 + i, 0); drawTile(sx, sy, i < n ? "#c49460" : "#78c7cf", i < n ? "solid" : "4"); if (i < n) for (let k = 0; k < 32; k += 3) rect(sx - 16 + k, sy + 7, 1, 2, "#8e6238"); }
  spriteB("cottage", ...[at(0, 0)[0], at(0, 0)[1] + 14]); spriteB("pine", at2(1, 0)[0], at2(1, 0)[1] + 11);
  if (n >= 4) { const [x, y] = artLerp(at(1, 0), at2(0, 0), (now * 0.4) % 1); artWalker(x, y + 9, 8); }
}
function artGreat(b) {
  const at = artGrass(b, 6, 2, b.x + b.w / 2 - 48, b.y + 12);
  const spr = [["townhall", 15], ["quarry", 14], ["lodge", 14], ["shepherd", 14], ["palm", 11], ["fir", 11]];
  spr.forEach(([n, base], i) => { if (ATLAS.sprites[n]) spriteB(n, at(i, i % 2)[0], at(i, i % 2)[1] + base); });
}

function artLighthouse(b) {
  rect(b.x, b.y, b.w, b.h, "#2a3a68");
  const at = artGrass(b, 2, 1, b.x + 30, b.y + 48);
  const [sx, sy] = at(0, 0);
  spriteB("lighthouse", sx, sy + 14);
  const h = spriteSize("lighthouse")[1], a = now * 1.3;
  ctx.fillStyle = "#fff0b0";
  for (let r = 6; r < 90; r += 2) { ctx.globalAlpha = 0.6 * (1 - r / 90); ctx.fillRect(Math.round(sx + Math.cos(a) * r), Math.round(sy + 20 - h + Math.sin(a) * r * 0.5), 2, 1); }
  ctx.globalAlpha = 1;
  const ph = (now * 0.2) % 1;
  spriteB("boat", b.x + b.w - 10 - ph * 60, b.y + b.h - 8 + Math.round(Math.sin(now * 3)), true);
}
