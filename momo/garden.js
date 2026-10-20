/*
 * Momo's garden: plant with stars, water, harvest and feed Momo (drag the
 * food to him or tap it), stroke him, play ball and dress him up with
 * things from the treasure chest.
 */
(function () {
  "use strict";
  const C = window.Wiese;
  const $ = (selector) => document.querySelector(selector);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let api = null;
  let active = false;
  let clock = null;
  let roam = null;
  let selectedBed = null;
  let momoX = 50;
  let momoY = 78;
  let destination = null;
  let roamWait = 1500;
  let chasingBall = false;
  let ballX = 24;
  let ballY = 84;
  let drag = null;
  let suppressClick = false;
  let stroke = 0;
  let armedItem = null;
  let armedTimer = null;
  const transientTimers = new Set();

  // Where worn things sit on Momo (viewBox 110 × 140).
  const WEAR_AT = {
    head: { x: 54, y: 30, size: 32 },
    ear: { x: 79, y: 44, size: 20 },
    face: { x: 54, y: 70, size: 30 },
    neck: { x: 54, y: 108, size: 28 },
  };
  function wearMarkup(worn) {
    return worn
      .map((id) => C.WARDROBE.find((item) => item.id === id))
      .filter((item) => item && WEAR_AT[item.slot])
      .map((item) => {
        const at = WEAR_AT[item.slot];
        return `<text class="momo-wear wear-${item.slot}" x="${at.x}" y="${at.y}" font-size="${at.size}" text-anchor="middle" dominant-baseline="central">${item.icon}</text>`;
      })
      .join("");
  }
  function momoSvg(mood = "ok", worn = api ? api.getState().wardrobe.worn : []) {
    return `<svg class="momo-body mood-${mood}" viewBox="0 0 110 140" aria-hidden="true">
      <g class="momo-ears"><ellipse cx="34" cy="33" rx="12" ry="30" fill="#fff8e9" transform="rotate(-12 34 33)"/><ellipse cx="70" cy="30" rx="12" ry="30" fill="#fff8e9" transform="rotate(9 70 30)"/>
      <ellipse cx="34" cy="30" rx="5" ry="21" fill="#edb9b4" transform="rotate(-12 34 30)"/><ellipse cx="70" cy="28" rx="5" ry="21" fill="#edb9b4" transform="rotate(9 70 28)"/></g>
      <circle cx="86" cy="108" r="13" fill="#fff8e9"/><ellipse cx="54" cy="108" rx="30" ry="26" fill="#f5ead2"/>
      <ellipse cx="33" cy="129" rx="18" ry="8" fill="#fff8e9"/><ellipse cx="76" cy="129" rx="18" ry="8" fill="#fff8e9"/>
      <ellipse cx="54" cy="72" rx="41" ry="35" fill="#fff8e9"/><ellipse cx="27" cy="80" rx="8" ry="5" fill="#f2bcb5"/><ellipse cx="80" cy="80" rx="8" ry="5" fill="#f2bcb5"/>
      <g class="momo-eyes" fill="#4e5241"><ellipse cx="39" cy="69" rx="3" ry="4"/><ellipse cx="68" cy="69" rx="3" ry="4"/></g>
      <path d="M50 79q4-3 8 0l-4 5Z" fill="#be8e7d"/>
      <path class="mouth m-ok" d="M54 84v3m-7 0q4 6 7 0 3 6 7 0" fill="none" stroke="#8d7764" stroke-width="1.8" stroke-linecap="round"/>
      <path class="mouth m-happy" d="M45 86q9 11 18 0Z" fill="#b8665f"/>
      <path class="mouth m-sad" d="M47 92q7-6 14 0" fill="none" stroke="#8d7764" stroke-width="2" stroke-linecap="round"/>
      <ellipse class="mouth m-hungry" cx="54" cy="90" rx="4" ry="5" fill="#9b5e58"/>
      <ellipse class="mouth m-open" cx="54" cy="90" rx="7" ry="7" fill="#9b5e58"/>
      <path d="M34 101q20 12 40 0l-5 11q-15 7-31-2Z" fill="#9bad84"/><path d="m64 107 10 15-11 1-5-14" fill="#9bad84"/>
      ${wearMarkup(worn)}
    </svg>`;
  }
  // Re-render Momo only when his look changes (mood or clothes).
  function momoKey(mood, state) {
    return `${mood}|${state.wardrobe.worn.join(",")}`;
  }

  function cropById(id) {
    return C.CROPS.find((crop) => crop.id === id);
  }
  function currentPlots(state, now) {
    return state.plots.map((plot) => C.plotAt(plot, now));
  }
  // One short sentence from Momo, most urgent first.
  function petMessage(state, now = Date.now()) {
    const plots = currentPlots(state, now).slice(0, C.bedCount(state.totalStars));
    const pet = C.petAt(state.pet, now);
    const hasFood = Object.keys(state.food).length > 0;
    const wish = C.petWish(state, now);
    if (plots.some((plot) => plot.phase === "ripe"))
      return "Im Garten ist etwas reif! Ernten wir es? 🧺";
    if (plots.some((plot) => plot.crop && plot.phase === "dry"))
      return "Meine Pflanzen haben Durst! 💧";
    const mood = C.petMood(pet);
    if (mood === "hungry")
      return hasFood
        ? "Ich hab Hunger! Gibst du mir etwas? 😋"
        : state.stars >= C.CROPS[0].cost
          ? "Ich hab Hunger! Pflanzt du mir eine Möhre? 🥕"
          : "Ich hab Hunger! Sammle Sterne, dann können wir Möhren pflanzen. ⭐";
    if (wish && state.food[wish.id])
      return `Hast du ${wish.one} für mich? Das wünsche ich mir! ${wish.icon}`;
    if (mood === "sad") return "Mir ist langweilig. Spielst du mit mir? 💛";
    if (wish && pet.full < 90) return `Ich träume von ${wish.one}. ${wish.icon}`;
    if (mood === "happy") return "Juhu! Mir geht es richtig gut! 🐰";
    if (!plots.some((plot) => plot.crop) && state.stars >= C.CROPS[0].cost)
      return "Wollen wir etwas pflanzen? 🌱";
    return "Hallo! Schön, dass du da bist.";
  }
  function needsMarkup(pet) {
    const bar = (label, icon, value, kind) =>
      `<div class="need need-${kind}"><span class="need-icon" aria-hidden="true">${icon}</span><span class="need-label">${label}</span><span class="need-bar" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value)}"><span style="width:${Math.round(value)}%"></span></span></div>`;
    return (
      bar("Satt", "🥕", pet.full, "full") + bar("Fröhlich", "💛", pet.joy, "joy")
    );
  }

  function later(callback, delay) {
    const id = setTimeout(() => {
      transientTimers.delete(id);
      callback();
    }, delay);
    transientTimers.add(id);
  }
  function status(message) {
    $("#garden-status-text").textContent = message;
  }
  function effect(x, y, symbol) {
    if (!active || document.hidden) return;
    const item = document.createElement("span");
    item.className = "garden-particle";
    item.textContent = symbol;
    item.style.left = `${x}%`;
    item.style.top = `${y}%`;
    const effects = $("#garden-effects");
    // Repeated tapping must not accumulate an unbounded number of particles.
    if (effects.children.length >= 12) effects.firstElementChild.remove();
    effects.append(item);
    later(() => item.remove(), 1700);
  }

  function build() {
    $("#garden-root").innerHTML = `
      <div class="garden-scene" id="garden-scene" role="group" aria-label="Momos Wiese">
        <div class="garden-sky" aria-hidden="true"><span class="garden-sun"></span><span class="living-cloud cloud-a">☁</span><span class="living-cloud cloud-b">☁</span></div>
        <div class="garden-ridge" aria-hidden="true"></div><div class="garden-meadow" aria-hidden="true"></div>
        <div id="garden-decor"></div>
        <p class="pet-bubble" id="pet-bubble"></p>
        <button id="garden-ball" class="garden-ball" aria-label="Ball werfen, Momo spielt mit" hidden><span aria-hidden="true">⚽</span></button>
        <button id="garden-momo" class="living-momo" aria-label="Momo streicheln"><span class="momo-shadow" aria-hidden="true"></span><span class="momo-wish" id="momo-wish" aria-hidden="true" hidden></span><span id="garden-momo-art"></span><span class="momo-snack" id="momo-snack" aria-hidden="true"></span></button>
        <div id="garden-effects" aria-hidden="true"></div>
      </div>
      <div class="pet-panel">
        <div class="needs" id="pet-needs"></div>
        <div class="food-row"><h2>Futter für Momo</h2><p class="food-hint">Zieh das Futter zu Momo – oder tippe drauf.</p><div id="food-list" class="food-list"></div></div>
      </div>
      <div class="garden-status"><p id="garden-status-text" role="status" aria-live="polite">Tippe auf ein Beet, um etwas zu pflanzen.</p></div>
      <h2 class="beds-title">Deine Beete</h2>
      <div class="beds" id="beds"></div>
      <div class="seed-picker" id="seed-picker" hidden>
        <div class="seed-picker-head"><strong>Was möchtest du pflanzen?</strong><button class="icon-button" id="close-seeds" aria-label="Nicht pflanzen">×</button></div>
        <div class="seed-list" id="seed-list"></div>
      </div>
      <h2 class="beds-title treasure-title">Momos Schatzkiste</h2>
      <p class="treasure-note">Übrige Sterne? Hier gibt es Sachen für Momo. Tippe zweimal zum Kaufen.</p>
      <div class="treasure-list" id="treasure-list"></div>
      <p class="next-unlock" id="next-unlock"></p>`;
    $("#beds").innerHTML = C.BEDS.map(
      (_, index) =>
        `<button class="bed" data-bed="${index}"><span class="bed-plant" aria-hidden="true"></span><span class="bed-label"></span><span class="bed-progress" aria-hidden="true"><span></span></span></button>`,
    ).join("");
    const momo = $("#garden-momo");
    momo.addEventListener("click", cuddle);
    momo.addEventListener("pointermove", strokeMomo);
    momo.addEventListener("pointerleave", () => {
      stroke = 0;
    });
    $("#garden-ball").addEventListener("click", throwBall);
    $("#beds").addEventListener("click", (event) => {
      const bed = event.target.closest("[data-bed]");
      if (bed) useBed(Number(bed.dataset.bed));
    });
    $("#food-list").addEventListener("click", (event) => {
      const food = event.target.closest("[data-food]");
      if (!food) return;
      // A drag ends with a click on the button; it was handled on drop.
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      feed(food.dataset.food, food);
    });
    $("#food-list").addEventListener("pointerdown", startDrag);
    document.addEventListener("pointermove", moveDrag);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", () => endDrag(null));
    $("#seed-list").addEventListener("click", (event) => {
      const seed = event.target.closest("[data-seed]");
      if (seed) plantSeed(seed.dataset.seed);
    });
    $("#treasure-list").addEventListener("click", (event) => {
      const item = event.target.closest("[data-item]");
      if (item) useItem(item.dataset.item);
    });
    $("#close-seeds").addEventListener("click", closeSeeds);
    $("#garden-decor").addEventListener("click", (event) => {
      const decor = event.target.closest("[data-decor]");
      if (!decor) return;
      const item = C.DECOR.find((x) => String(x.at) === decor.dataset.decor);
      effect(item.x, item.y - 8, "✨");
      status(`${item.name} wohnt jetzt in deinem Garten. ✨`);
    });
  }

  function render() {
    if (!api) return;
    const state = api.getState();
    const now = Date.now();
    const pet = C.petAt(state.pet, now);
    const mood = C.petMood(pet);
    const art = $("#garden-momo-art");
    const key = momoKey(mood, state);
    if (art.dataset.key !== key) {
      art.innerHTML = momoSvg(mood, state.wardrobe.worn);
      art.dataset.key = key;
    }
    const wish = C.petWish(state, now);
    $("#momo-wish").hidden = !wish;
    $("#momo-wish").textContent = wish ? wish.icon : "";
    $("#garden-ball").hidden = !state.wardrobe.owned.includes("ball");
    $("#pet-bubble").textContent = petMessage(state, now);
    $("#pet-needs").innerHTML = needsMarkup(pet);
    renderFood(state);
    renderBeds(state, now);
    renderDecor(state);
    renderTreasure(state);
    const next = C.nextUnlock(state.totalStars);
    $("#next-unlock").textContent = next
      ? `Noch ${next.at - state.totalStars} ⭐ sammeln, dann bekommst du: ${next.icon} ${next.name}`
      : "Du hast alles freigeschaltet! 🌈";
    if (selectedBed !== null) renderSeeds(state);
  }
  function renderFood(state) {
    const items = C.CROPS.filter((crop) => state.food[crop.id] > 0);
    // Rebuilding only on change keeps the buttons stable under a dragging finger.
    const key = items.map((crop) => `${crop.id}:${state.food[crop.id]}`).join(",");
    const list = $("#food-list");
    if (list.dataset.key === key && list.childElementCount) return;
    const focused = document.activeElement?.dataset?.food;
    list.dataset.key = key;
    list.innerHTML = items.length
      ? items
          .map(
            (crop) =>
              `<button class="food-button" data-food="${crop.id}" aria-label="Momo ${crop.name} geben, ${state.food[crop.id]} übrig"><span aria-hidden="true">${crop.icon}</span><b>${state.food[crop.id]}</b></button>`,
          )
          .join("")
      : `<p class="food-empty">Noch kein Futter. Pflanze etwas an! 🌱</p>`;
    if (focused) $(`[data-food="${focused}"]`)?.focus({ preventScroll: true });
  }
  function renderBeds(state, now) {
    const open = C.bedCount(state.totalStars);
    const plots = currentPlots(state, now);
    document.querySelectorAll("[data-bed]").forEach((button) => {
      const index = Number(button.dataset.bed);
      const plot = plots[index];
      const locked = index >= open;
      // Show all open beds and only the next locked one as a goal.
      button.hidden = locked && index > open;
      button.disabled = locked;
      const crop = plot.crop && cropById(plot.crop);
      let icon = "＋";
      let label = "Pflanzen";
      let look = "empty";
      if (locked) {
        icon = "🔒";
        label = `ab ${C.BEDS[index]} ⭐`;
        look = "locked";
      } else if (crop && plot.phase === "ripe") {
        icon = crop.icon;
        label = "Ernten!";
        look = "ripe";
      } else if (crop) {
        icon = plot.step === 0 ? (plot.phase === "dry" ? "🟤" : "🌱") : "🌿";
        label = plot.phase === "dry" ? "💧 Gießen!" : "wächst …";
        look = plot.phase;
      }
      button.dataset.state = look;
      button.querySelector(".bed-plant").textContent = icon;
      button.querySelector(".bed-label").textContent = label;
      button.querySelector(".bed-progress span").style.width =
        `${Math.round(C.plotProgress(plot, now) * 100)}%`;
      button.setAttribute(
        "aria-label",
        locked
          ? `Beet ${index + 1}, gesperrt bis ${C.BEDS[index]} Sterne`
          : crop
            ? `Beet ${index + 1}: ${crop.name}, ${label}`
            : `Beet ${index + 1}: leer, pflanzen`,
      );
      button.classList.toggle("selected", selectedBed === index);
    });
  }
  function renderDecor(state) {
    const unlocked = C.DECOR.filter((item) => state.totalStars >= item.at);
    const container = $("#garden-decor");
    if (container.childElementCount === unlocked.length) return;
    container.innerHTML = unlocked
      .map(
        (item) =>
          `<button class="garden-decor" data-decor="${item.at}" style="left:${item.x}%;top:${item.y}%" aria-label="${item.name}"><span aria-hidden="true">${item.icon}</span></button>`,
      )
      .join("");
  }
  function renderSeeds(state) {
    const crops = C.availableCrops(state.totalStars);
    // Rebuilding only on change keeps buttons stable under a finger.
    const key = `${state.stars}|${crops.length}`;
    if ($("#seed-list").dataset.key === key) return;
    $("#seed-list").dataset.key = key;
    $("#seed-list").innerHTML = crops
      .map(
        (crop) =>
          `<button class="seed-button" data-seed="${crop.id}"${state.stars < crop.cost ? ' aria-disabled="true"' : ""}><span class="seed-icon" aria-hidden="true">${crop.icon}</span><span>${crop.name}</span><span class="seed-cost">${crop.cost} ⭐</span></button>`,
      )
      .join("");
  }
  function renderTreasure(state) {
    const { owned, worn } = state.wardrobe;
    const key = `${state.stars}|${owned.join()}|${worn.join()}|${armedItem}`;
    const list = $("#treasure-list");
    if (list.dataset.key === key) return;
    const focused = document.activeElement?.dataset?.item;
    list.dataset.key = key;
    list.innerHTML = C.WARDROBE.map((item) => {
      const has = owned.includes(item.id);
      const on = worn.includes(item.id);
      const note = !has
        ? `${item.cost} ⭐`
        : item.slot === "toy"
          ? "im Garten"
          : on
            ? "trägt Momo"
            : "anziehen";
      const label = !has
        ? `${item.name} für ${item.cost} Sterne kaufen${armedItem === item.id ? ", noch einmal tippen" : ""}`
        : item.slot === "toy"
          ? `${item.name}: liegt im Garten`
          : `${item.name}: ${on ? "ausziehen" : "anziehen"}`;
      const look = has ? (on ? " worn" : " owned") : state.stars < item.cost ? " too-expensive" : "";
      return `<button class="treasure-item${look}${armedItem === item.id ? " armed" : ""}" data-item="${item.id}" aria-label="${label}"${item.slot !== "toy" && has ? ` aria-pressed="${on}"` : ""}><span class="treasure-icon" aria-hidden="true">${item.icon}</span><span>${item.name}</span><span class="seed-cost">${note}</span></button>`;
    }).join("");
    if (focused) $(`[data-item="${focused}"]`)?.focus({ preventScroll: true });
  }

  function useBed(index) {
    const state = api.getState();
    const now = Date.now();
    const plot = C.plotAt(state.plots[index], now);
    if (!plot.crop) {
      selectedBed = index;
      renderSeeds(state);
      $("#seed-picker").hidden = false;
      renderBeds(state, now);
      $("#seed-list button")?.focus({ preventScroll: true });
      $("#seed-picker").scrollIntoView({ block: "nearest", behavior: "smooth" });
      status(
        state.stars
          ? `Du hast ${state.stars} ⭐. Such dir Samen aus!`
          : "Du hast noch keine Sterne. Spiel eine Runde, dann kannst du pflanzen! ⭐",
      );
      return;
    }
    if (plot.phase === "dry") {
      api.save((latest) => C.water(latest, index, Date.now())).then(() => {
        status(
          plot.step === 0
            ? "Plitsch, platsch! Jetzt wächst ein kleiner Keim. 🌱"
            : "Noch einmal gegossen – bald ist es reif! 💧",
        );
        bedEffect(index, "watering");
      });
    } else if (plot.phase === "ripe") {
      let crop = null;
      api
        .save((latest) => {
          crop = C.harvest(latest, index, Date.now());
        })
        .then(() => {
          if (!crop) return;
          status(
            `Geerntet: ${crop.yield} ${crop.yield === 1 ? crop.name : crop.plural}! Gib sie Momo. ${crop.icon}`,
          );
          bedEffect(index);
        });
    } else {
      status("Das wächst noch. Spiel doch solange eine Runde! ⭐");
    }
  }
  function bedEffect(index, kind = "pop") {
    const bed = document.querySelector(`[data-bed="${index}"]`);
    bed.classList.remove("pop", "watering");
    void bed.offsetWidth;
    bed.classList.add(kind);
    later(() => bed.classList.remove(kind), kind === "watering" ? 1200 : 700);
  }
  function plantSeed(cropId) {
    const index = selectedBed;
    if (index === null) return;
    const crop = cropById(cropId);
    const state = api.getState();
    if (state.stars < crop.cost) {
      status(
        `Für ${crop.name === "Apfel" ? "einen Apfelbaum" : crop.name} brauchst du ${crop.cost} ⭐. Spiel eine Runde, dann bekommst du Sterne!`,
      );
      return;
    }
    let result = null;
    api
      .save((latest) => {
        result = C.plant(latest, index, cropId, Date.now());
      })
      .then(() => {
        if (result !== "planted") return;
        closeSeeds(false);
        status(`${crop.name} ist eingepflanzt! Jetzt braucht das Beet Wasser. Tippe drauf. 💧`);
        bedEffect(index);
        document.querySelector(`[data-bed="${index}"]`).focus({ preventScroll: true });
      });
  }
  function closeSeeds(focus = true) {
    const index = selectedBed;
    selectedBed = null;
    $("#seed-picker").hidden = true;
    render();
    if (focus && index !== null)
      document.querySelector(`[data-bed="${index}"]`)?.focus({ preventScroll: true });
  }

  /* ---------- Feeding: drag the food to Momo, or tap it ---------- */
  function overMomo(x, y) {
    const box = $("#garden-momo").getBoundingClientRect();
    const margin = 30;
    return (
      x >= box.left - margin && x <= box.right + margin && y >= box.top - margin && y <= box.bottom + margin
    );
  }
  function startDrag(event) {
    const button = event.target.closest("[data-food]");
    if (!button || event.button > 0) return;
    drag = { id: button.dataset.food, button, x: event.clientX, y: event.clientY, ghost: null };
  }
  function moveDrag(event) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 10) return;
      drag.ghost = document.createElement("span");
      drag.ghost.className = "food-ghost";
      drag.ghost.setAttribute("aria-hidden", "true");
      drag.ghost.textContent = cropById(drag.id).icon;
      document.body.append(drag.ghost);
      $("#garden-momo").classList.add("wants");
    }
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
    $("#garden-momo").classList.toggle("ready", overMomo(event.clientX, event.clientY));
  }
  function endDrag(event) {
    if (!drag) return;
    const { ghost, id, button } = drag;
    drag = null;
    $("#garden-momo").classList.remove("wants", "ready");
    if (!ghost) return;
    ghost.remove();
    suppressClick = true;
    // The click that follows a drag never arrives when it ended elsewhere.
    setTimeout(() => {
      suppressClick = false;
    }, 400);
    if (event && overMomo(event.clientX, event.clientY)) feed(id, null);
    else {
      status("Zieh das Futter bis zu Momo! 🐰");
      button.focus({ preventScroll: true });
    }
  }
  // A tapped food flies to Momo first.
  function fly(from, icon) {
    if (!from || reducedMotion.matches || !from.isConnected) return Promise.resolve();
    const start = from.getBoundingClientRect();
    const end = $("#garden-momo").getBoundingClientRect();
    const ghost = document.createElement("span");
    ghost.className = "food-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = icon;
    ghost.style.left = `${start.left + start.width / 2}px`;
    ghost.style.top = `${start.top + start.height / 2}px`;
    document.body.append(ghost);
    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height * 0.55 - (start.top + start.height / 2);
    return new Promise((resolve) => {
      const animation = ghost.animate(
        [
          { transform: "translate(-50%, -50%)" },
          { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - 60}px)) scale(1.15)` },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)` },
        ],
        { duration: 520, easing: "ease-in-out" },
      );
      const done = () => {
        ghost.remove();
        resolve();
      };
      animation.onfinish = done;
      animation.oncancel = done;
    });
  }
  function feed(cropId, from) {
    const crop = cropById(cropId);
    let result = null;
    api
      .save((latest) => {
        result = C.feedPet(latest, cropId, Date.now());
      })
      .then(async () => {
        if (result === "full") {
          status("Momo ist pappsatt! Heb das Futter für später auf. 😊");
          const momo = $("#garden-momo");
          momo.classList.remove("refuse");
          void momo.offsetWidth;
          momo.classList.add("refuse");
          later(() => momo.classList.remove("refuse"), 700);
          return;
        }
        if (result !== "eaten" && result !== "wish") return;
        status(
          result === "wish"
            ? `Mampf, mampf! Juhu, das hat sich Momo gewünscht! ${crop.icon} 💖`
            : `Mampf, mampf! Momo liebt ${crop.plural}. ${crop.icon}`,
        );
        await fly(from, crop.icon);
        eat(crop, result === "wish");
      });
  }
  // Momo holds the food and eats it bite by bite.
  function eat(crop, wished) {
    const momo = $("#garden-momo");
    const snack = $("#momo-snack");
    snack.textContent = crop.icon;
    snack.classList.remove("biting");
    momo.classList.remove("eating", "cheering");
    void momo.offsetWidth;
    snack.classList.add("biting");
    momo.classList.add("eating");
    later(() => {
      snack.classList.remove("biting");
      snack.textContent = "";
      momo.classList.remove("eating");
      if (wished) {
        momo.classList.add("cheering");
        later(() => momo.classList.remove("cheering"), 1400);
      }
    }, 1300);
    for (let i = 0; i < 3; i++)
      later(() => effect(momoX + (i - 1) * 5, momoY - 12, "·"), 250 + i * 330);
    later(() => effect(momoX, momoY - 24, wished ? "💖" : "😋"), 1100);
    if (wished) later(() => effect(momoX + 8, momoY - 30, "🎉"), 1300);
  }

  /* ---------- Cuddling, stroking and playing ---------- */
  function cuddle() {
    roamWait = 4000;
    destination = null;
    chasingBall = false;
    $("#garden-momo").classList.remove("hopping");
    api.save((latest) => C.cuddlePet(latest, Date.now()));
    effect(momoX, momoY - 22, "💛");
    status("Momo kuschelt sich an deine Hand. 💛");
  }
  // Stroking: moving a pressed finger or mouse over Momo sends hearts.
  function strokeMomo(event) {
    if (!(event.buttons & 1) && event.pointerType !== "touch") return;
    stroke += Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0);
    if (stroke < 140) return;
    stroke = 0;
    roamWait = 4000;
    destination = null;
    api.save((latest) => C.cuddlePet(latest, Date.now()));
    effect(momoX + (Math.random() * 16 - 8), momoY - 26, "💕");
    status("Momo genießt das Streicheln. Er schließt die Augen. 💕");
  }
  function throwBall() {
    ballX = 14 + Math.random() * 72;
    ballY = 74 + Math.random() * 14;
    positionBall();
    status("Hol den Ball, Momo! ⚽");
    if (reducedMotion.matches || !roam) {
      // Without motion Momo is right there and plays at once.
      momoX = ballX;
      momoY = ballY;
      positionMomo();
      playBall();
      return;
    }
    chasingBall = true;
    roamWait = 0;
    destination = { x: ballX, y: ballY };
  }
  function playBall() {
    chasingBall = false;
    api.save((latest) => C.playPet(latest, Date.now()));
    effect(momoX, momoY - 26, "💛");
    effect(momoX + 8, momoY - 16, "⚽");
    status("Momo hat den Ball! Das macht Spaß. ⚽💛");
  }
  function positionBall() {
    const ball = $("#garden-ball");
    ball.style.left = `${ballX}%`;
    ball.style.top = `${ballY}%`;
  }

  /* ---------- Treasure chest ---------- */
  function useItem(id) {
    const item = C.WARDROBE.find((x) => x.id === id);
    const state = api.getState();
    if (state.wardrobe.owned.includes(id)) {
      if (item.slot === "toy") {
        status("Der Ball liegt im Garten. Tippe ihn an, dann spielt Momo! ⚽");
        return;
      }
      let result = null;
      api
        .save((latest) => {
          result = C.wearItem(latest, id);
        })
        .then(() =>
          status(result === "worn" ? `Momo trägt jetzt: ${item.name} ${item.icon}` : `${item.name} ist wieder in der Kiste.`),
        );
      return;
    }
    if (state.stars < item.cost) {
      status(`Für ${item.name} brauchst du ${item.cost} ⭐. Du hast ${state.stars} ⭐.`);
      return;
    }
    // Buying needs a second tap, so no stars are spent by accident.
    if (armedItem !== id) {
      armedItem = id;
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => {
        armedItem = null;
        if (api) renderTreasure(api.getState());
      }, 6000);
      renderTreasure(state);
      status(`${item.name} kostet ${item.cost} ⭐. Tippe noch einmal zum Kaufen!`);
      return;
    }
    armedItem = null;
    clearTimeout(armedTimer);
    let result = null;
    api
      .save((latest) => {
        result = C.buyItem(latest, id);
      })
      .then(() => {
        if (result !== "bought") return;
        status(
          item.slot === "toy"
            ? "Ein Ball für Momo! Tippe ihn im Garten an. ⚽"
            : `Gekauft! Momo trägt jetzt: ${item.name} ${item.icon}`,
        );
        effect(momoX, momoY - 30, "✨");
      });
  }

  function positionMomo() {
    const momo = $("#garden-momo");
    momo.style.left = `${momoX}%`;
    momo.style.top = `${momoY}%`;
  }
  function step() {
    const momo = $("#garden-momo");
    if (roamWait > 0) {
      roamWait -= 100;
      return;
    }
    if (!destination)
      destination = { x: 18 + Math.random() * 64, y: 70 + Math.random() * 16 };
    const dx = destination.x - momoX;
    const dy = destination.y - momoY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1.3) {
      destination = null;
      roamWait = 1800 + Math.random() * 2500;
      momo.classList.remove("hopping");
      if (chasingBall) playBall();
    } else {
      const speed = chasingBall ? 2.2 : 1.3;
      momoX += (dx / distance) * Math.min(speed, distance);
      momoY += (dy / distance) * Math.min(speed, distance);
      momo.classList.add("hopping");
      momo.style.setProperty("--facing", dx < 0 ? "-1" : "1");
    }
    positionMomo();
  }
  function sync() {
    clearInterval(clock);
    clearInterval(roam);
    clock = roam = null;
    const running = active && !document.hidden;
    if (running) {
      clock = setInterval(render, 1000);
      if (!reducedMotion.matches) roam = setInterval(step, 100);
    }
    if (!roam) $("#garden-momo")?.classList.remove("hopping");
  }
  function setActive(value) {
    active = value;
    if (!active) {
      transientTimers.forEach(clearTimeout);
      transientTimers.clear();
      $("#garden-effects")?.replaceChildren();
      $("#momo-snack")?.classList.remove("biting");
      chasingBall = false;
      if (drag) endDrag(null);
      if (selectedBed !== null) {
        selectedBed = null;
        $("#seed-picker").hidden = true;
      }
    } else render();
    sync();
  }
  function init(options) {
    api = options;
    build();
    positionMomo();
    positionBall();
    render();
    reducedMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
  }

  window.WieseGarden = { init, render, setActive, momoSvg, momoKey, petMessage, needsMarkup };
})();
