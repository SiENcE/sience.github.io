(function () {
  "use strict";
  const C = window.Wiese;
  const G = window.WieseGarden;
  const M = window.WieseMath;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = "woerterwiese.v1";
  const SUCCESS_DELAY = 1700;
  let state = C.defaultState();
  let storageAvailable = true;
  try {
    state = C.sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    storageAvailable = false;
  }
  let game = null;
  let currentView = "home";
  // Where the child is in the menu: subject → category → games.
  let menu = { subject: "deutsch", category: null };
  let activeMilliseconds = 0;
  let lastTick = Date.now();
  let pauseSuggested = false;
  let voices = [];
  let speechGeneration = 0;
  let speechDelay;
  let speechWatchdog;
  let advanceTimer = null;
  let currentAudio = null;
  let endSpeech = null;
  const playedLaute = [];
  const praise = [
    "Super! ⭐",
    "Richtig! ⭐",
    "Toll gemacht! ⭐",
    "Genau! ⭐",
    "Klasse! ⭐",
  ];

  async function save(change) {
    const commit = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (storageAvailable) state = C.sanitizeState(JSON.parse(stored));
      } catch {
        storageAvailable = false;
      }
      change(state);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        storageAvailable = true;
      } catch {
        storageAvailable = false;
      }
      $("#storage-warning").hidden = storageAvailable;
      refresh();
    };
    // Serialize read-modify-write across tabs where Web Locks are available.
    if (navigator.locks) await navigator.locks.request(STORAGE_KEY, commit);
    else commit();
  }
  function refresh() {
    $("#total-stars").textContent = state.stars;
    const now = Date.now();
    const plots = state.plots
      .slice(0, C.bedCount(state.totalStars))
      .map((plot) => C.plotAt(plot, now));
    $("#garden-alert").hidden = !(
      plots.some((plot) => plot.phase === "ripe" || plot.phase === "dry") ||
      C.petMood(C.petAt(state.pet, now)) === "hungry"
    );
    if (currentView === "home") renderHome();
    if (currentView === "menu") renderMenu();
    if (currentView === "report")
      window.WieseReport.render($("#report-root"), C.buildReport(state));
    if (currentView === "garden") G.render();
  }
  $("#storage-warning").hidden = storageAvailable;

  function displayLetter(letter, lower = false) {
    return lower || state.settings.lowercase ? letter.toLowerCase() : letter;
  }
  function letterMarkup(letter, lower = false) {
    return `<span class="letter" data-letter="${letter}">${displayLetter(letter, lower)}</span>`;
  }
  function letterButton(letter, lower = false) {
    return `<button class="letter-button" data-answer="${letter}" aria-label="Buchstabe ${displayLetter(letter, lower)}">${letterMarkup(letter, lower)}</button>`;
  }

  /* ---------- Speech ---------- */
  function stopSpeech() {
    speechGeneration++;
    clearTimeout(speechDelay);
    clearTimeout(speechWatchdog);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (currentAudio) {
      currentAudio.onended = currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio = null;
    }
    endSpeech?.();
    $$(".speaking").forEach((button) => button.classList.remove("speaking"));
  }
  function chosenVoice() {
    return (
      voices.find((voice) => voice.voiceURI === state.settings.voice) ||
      voices.find((voice) => voice.localService) ||
      voices[0]
    );
  }
  function speechAvailable() {
    return (
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window &&
      voices.length > 0
    );
  }
  // Without a working voice an adult can read the task aloud instead.
  function revealSpeechFallback(message) {
    if ($("#settings-dialog").open) {
      $("#voice-status").textContent = message;
      return;
    }
    if (currentView !== "game") return;
    $("#speech-notice").textContent = message;
    $("#speech-notice").hidden = false;
    $("#adult-cue").hidden = false;
  }
  /*
   * Plays a queue of parts one after another and resolves when all are done
   * (or cancelled). Strings go to the browser voice; { laut: "M" } plays the
   * recorded German sound audio/laute/m.wav, because browser voices can only
   * spell letters ("Emm"), not sound them ("mmm"). A laut part may carry
   * "gap" (pause before it, after another laut) and "highlight" (a selector
   * in the task that lights up while it plays).
   */
  function speak(text, button = null) {
    stopSpeech();
    let parts = [text].flat(2).filter(Boolean);
    if (parts.some((part) => typeof part === "string") && !speechAvailable()) {
      revealSpeechFallback(
        "Hier gibt es gerade keine deutsche Stimme. Bitte einen Erwachsenen, dir vorzulesen.",
      );
      parts = parts.filter((part) => typeof part !== "string");
      if (!parts.length) return Promise.resolve();
    }
    const generation = speechGeneration;
    button?.classList.add("speaking");
    return new Promise((resolve) => {
      let previous = null;
      const end = () => {
        endSpeech = null;
        button?.classList.remove("speaking");
        $$(".sounding").forEach((element) => element.classList.remove("sounding"));
        resolve();
      };
      endSpeech = end;
      const finished = () => {
        if (generation !== speechGeneration) return;
        $$(".sounding").forEach((element) => element.classList.remove("sounding"));
        if (!parts.length) return end();
        const next = parts[0];
        const delay =
          typeof previous === "object" && typeof next === "object" && next.gap != null
            ? next.gap
            : 550;
        speechDelay = setTimeout(readNext, delay);
      };
      function playLaut(part) {
        const letter = part.laut;
        const audio = new Audio(`audio/laute/${letter.toLowerCase()}.wav`);
        currentAudio = audio;
        playedLaute.push(letter);
        const highlight =
          part.highlight ?? (part.dot != null ? `[data-dot="${part.dot}"]` : null);
        if (highlight)
          $$(`#task-area ${highlight}`).forEach((element) =>
            element.classList.add("sounding"),
          );
        audio.onended = finished;
        audio.onerror = () => {
          if (generation !== speechGeneration) return;
          // Without the sound file, describe the sound by a word instead of naming the letter.
          if (speechAvailable()) {
            parts.unshift(`Der Laut ganz am Anfang von ${C.LAUTE[letter].example}.`);
            previous = null;
            finished();
          } else {
            revealSpeechFallback(
              "Der Laut kann hier nicht abgespielt werden. Bitte einen Erwachsenen, ihn dir vorzusprechen.",
            );
            end();
          }
        };
        audio.play().catch((error) => {
          // Autoplay blocked before the first tap: the 🔊 button plays it later.
          if (error?.name !== "NotAllowedError") audio.onerror?.();
          else if (generation === speechGeneration) end();
        });
      }
      function readNext() {
        if (generation !== speechGeneration) return;
        const part = parts.shift();
        previous = part;
        if (typeof part === "object") return playLaut(part);
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.lang = "de-DE";
        utterance.voice = chosenVoice();
        utterance.rate = state.settings.rate;
        utterance.pitch = 1.05;
        utterance.onstart = () => {
          if (generation !== speechGeneration) return;
          clearTimeout(speechWatchdog);
          if ($("#settings-dialog").open)
            $("#voice-status").textContent =
              "Die Stimme wird gerade abgespielt. Passt das Tempo?";
        };
        utterance.onend = () => {
          if (generation !== speechGeneration) return;
          clearTimeout(speechWatchdog);
          finished();
        };
        utterance.onerror = (event) => {
          if (generation !== speechGeneration) return;
          clearTimeout(speechWatchdog);
          if (!["canceled", "interrupted"].includes(event.error))
            revealSpeechFallback(
              "Das Vorlesen hat gerade nicht geklappt. Tippe noch einmal auf 🔊 oder bitte einen Erwachsenen, dir vorzulesen.",
            );
          end();
        };
        // Some mobile engines need one event-loop turn after cancel before speaking again.
        speechDelay = setTimeout(() => {
          if (generation !== speechGeneration) return;
          try {
            window.speechSynthesis.speak(utterance);
            speechWatchdog = setTimeout(() => {
              if (generation !== speechGeneration) return;
              revealSpeechFallback(
                "Noch nichts gehört? Tippe noch einmal auf 🔊 oder bitte jemanden, dir vorzulesen.",
              );
              end();
            }, 7000);
          } catch {
            revealSpeechFallback(
              "Das Vorlesen geht hier nicht. Bitte einen Erwachsenen, dir vorzulesen.",
            );
            end();
          }
        }, 60);
      }
      readNext();
    });
  }
  function autoSpeak(text, button) {
    return state.settings.autoSpeak ? speak(text, button) : Promise.resolve();
  }
  function updateVoices() {
    const wasAvailable = speechAvailable();
    voices =
      "speechSynthesis" in window
        ? window.speechSynthesis
            .getVoices()
            .filter((voice) => /^de(?:[-_]|$)/i.test(voice.lang))
        : [];
    const select = $("#voice-select");
    select.replaceChildren(new Option("Automatisch auswählen", ""));
    voices.forEach((voice) =>
      select.add(
        new Option(
          `${voice.name}${voice.localService ? " · lokal" : " · eventuell online"}`,
          voice.voiceURI,
        ),
      ),
    );
    select.value = voices.some(
      (voice) => voice.voiceURI === state.settings.voice,
    )
      ? state.settings.voice
      : "";
    $("#voice-status").textContent = voices.length
      ? `${voices.length} deutsche ${voices.length === 1 ? "Stimme" : "Stimmen"} verfügbar. Bitte einmal probehören.`
      : "Keine deutsche Stimme gefunden. Ihr könnt trotzdem spielen: Bei jeder Aufgabe gibt es dann einen Vorlesetext für Erwachsene.";
    if (currentView === "game" && game && !game.answered) {
      if (!speechAvailable())
        revealSpeechFallback(
          "Hier gibt es gerade keine deutsche Stimme. Bitte einen Erwachsenen, dir vorzulesen.",
        );
      else {
        $("#speech-notice").hidden = true;
        $("#adult-cue").hidden = true;
        if (!wasAvailable && !$("#settings-dialog").open) speakTask();
      }
    }
  }

  /* ---------- Views ---------- */
  function showView(view, focus = true) {
    stopSpeech();
    clearTimeout(advanceTimer);
    currentView = view;
    $$(".view").forEach((section) => {
      section.hidden = section.id !== `${view}-view`;
    });
    $$(".nav-button").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view !== "game") {
      game = null;
      $("#pause-banner").hidden = true;
    }
    G.setActive(view === "garden");
    refresh();
    window.scrollTo({ top: 0, behavior: "instant" });
    if (focus) {
      const target = $(`#${view}-view h1`);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }
  function renderHome() {
    const now = Date.now();
    const pet = C.petAt(state.pet, now);
    const mood = C.petMood(pet);
    const home = $("#home-momo");
    if (home.dataset.mood !== mood) {
      home.innerHTML = G.momoSvg(mood);
      home.dataset.mood = mood;
    }
    $("#home-momo-says").textContent = G.petMessage(state, now);
    $("#home-needs").innerHTML = G.needsMarkup(pet);
    const next = C.ACTIVITIES.find(
      (activity) => activity.id === C.recommendedGame(state),
    );
    $("#start-button").dataset.activity = next.id;
    $("#start-button").innerHTML =
      `<span aria-hidden="true">▶</span> Spielen<small>${next.icon} ${next.title}</small>`;
    $("#subject-grid").innerHTML = C.SUBJECTS.map((subject) => {
      const icons = C.CATEGORIES.filter((x) => x.subject === subject.id)
        .map((x) => x.icon)
        .join(" ");
      return `<button class="subject-card ${subject.color}" data-subject="${subject.id}"><span class="subject-icon" aria-hidden="true">${subject.icon}</span><span class="subject-title">${subject.title}</span><span class="subject-icons" aria-hidden="true">${icons}</span></button>`;
    }).join("");
  }
  function activityCard(activity) {
    const level = state.levels[activity.id];
    const max = C.maxLevel(activity.id);
    return `<button class="activity-card ${activity.color}" data-activity="${activity.id}"><span class="activity-icon" aria-hidden="true">${activity.icon}</span><span class="activity-title">${activity.title}</span>${activity.together ? '<span class="together-badge" title="Mit einem Erwachsenen">👥 zu zweit</span>' : ""}<span class="activity-level"><span class="level-bar" aria-hidden="true"><span style="width:${((level + 1) / (max + 1)) * 100}%"></span></span>Stufe ${level + 1}</span></button>`;
  }
  function openMenu(subject, category = null) {
    menu = { subject, category };
    showView("menu");
  }
  function openMenuFor(mode) {
    const category = C.categoryOf(mode);
    if (category) openMenu(category.subject, category.id);
    else showView("home");
  }
  // One view for both steps: the categories of a subject, or the games of a category.
  function renderMenu() {
    const subject = C.SUBJECTS.find((x) => x.id === menu.subject) || C.SUBJECTS[0];
    const category = C.CATEGORIES.find((x) => x.id === menu.category);
    $("#menu-title").textContent = category ? category.title : subject.title;
    $("#menu-path").textContent = category ? `${subject.icon} ${subject.title}` : "";
    $("#menu-back").textContent = category ? `← ${subject.title}` : "← Startseite";
    $("#menu-grid").innerHTML = category
      ? category.games
          .map((id) => activityCard(C.ACTIVITIES.find((x) => x.id === id)))
          .join("")
      : C.CATEGORIES.filter((x) => x.subject === subject.id)
          .map((x) => {
            const icons = x.games
              .map((id) => C.ACTIVITIES.find((activity) => activity.id === id).icon)
              .join(" ");
            const count = `${x.games.length} ${x.games.length === 1 ? "Spiel" : "Spiele"}`;
            return `<button class="activity-card category-card ${x.color}" data-category="${x.id}"><span class="activity-icon" aria-hidden="true">${x.icon}</span><span class="activity-title">${x.title}</span><span class="category-games"><span aria-hidden="true">${icons}</span> ${count}</span></button>`;
          })
          .join("");
  }

  /* ---------- Game flow ---------- */
  function beginGame(mode) {
    const activity = C.ACTIVITIES.find((item) => item.id === mode);
    if (!activity) return;
    game = {
      mode,
      activity,
      hits: 0,
      tasks: 0,
      missStreak: 0,
      startLevel: state.levels[mode],
      startingTotal: state.totalStars,
      question: null,
      answered: false,
      mistakes: 0,
    };
    lastTick = Date.now();
    save((latest) => {
      latest.lastPlayed[mode] = Date.now();
    });
    showView("game", false);
    $("#game-icon").textContent = activity.icon;
    $("#game-title").textContent = activity.title;
    nextTask();
  }
  function instruction() {
    const q = game.question;
    if (C.MATH_GAMES.includes(game.mode)) return M.instruction(q);
    const same = (text) => ({ text, speech: text });
    switch (game.mode) {
      case "type":
        return same("Hör gut zu: Welchen Laut hörst du? Tippe den Buchstaben an.");
      case "initial":
        return same(
          q.reverse
            ? "Hör gut zu: Welches Bild fängt mit diesem Laut an?"
            : "Hör gut zu: Mit welchem Buchstaben fängt das Wort an?",
        );
      case "merk":
        return same("Hör gut zu: Was fehlt im Wort?");
      case "blend":
        return same(
          q.written
            ? "Momo zaubert ein Wort aus Lauten. Welches Wort ist es? Lies genau!"
            : "Momo zaubert ein Wort aus Lauten. Welches Bild passt?",
        );
      case "missing":
        return same(
          q.answers.length > 1
            ? `Hier fehlen ${q.answers.length} Buchstaben. Welche?`
            : "Welcher Buchstabe fehlt?",
        );
      case "neighbor":
        // Spoken without letter names: the children learn sounds, not names.
        if (q.dir === "between")
          return {
            text: `Wer steht zwischen ${displayLetter(q.left)} und ${displayLetter(q.right)}?`,
            speech: "Welcher Buchstabe steht in der Mitte?",
          };
        return {
          text: `Wer kommt ${q.dir === "after" ? "nach" : "vor"} ${displayLetter(q.target)}?`,
          speech: `Welcher Buchstabe kommt ${q.dir === "after" ? "danach" : "davor"}?`,
        };
      case "order":
        return same(
          q.reverse
            ? "Rückwärts! Tippe die Buchstaben vom letzten bis zum ersten an."
            : "Tippe die Buchstaben in der ABC-Reihenfolge an.",
        );
      case "memory":
        return same(
          q.reverse
            ? "Hör gut zu. Sprich die Wörter rückwärts nach!"
            : "Hör gut zu und sprich die Wörter nach.",
        );
      case "echo":
        return same(
          q.parts.length > 1
            ? "Hör gut zu und sprich die Quatschwörter nach."
            : "Hör gut zu und sprich das Quatschwort nach.",
        );
      default:
        return same(
          q.reverse
            ? "Hör gut zu. Mach die Bewegungen rückwärts nach!"
            : "Hör gut zu und mach die Bewegungen nach.",
        );
    }
  }
  function speakTask(button = null) {
    speak([instruction().speech, game.question.speech], button);
  }
  function nextTask() {
    stopSpeech();
    clearTimeout(advanceTimer);
    const level = state.levels[game.mode];
    game.question = C.makeQuestion(game.mode, level, game.question);
    game.answered = false;
    game.mistakes = 0;
    game.filled = [];
    game.alternative = null;
    game.wrongPicks = [];
    game.swaps = 0;
    game.built = game.question.start ? { ...game.question.start } : null;
    game.tapLaut = null;
    game.taskStart = Date.now();
    setFeedback("", "");
    setMomo("ok");
    updateRoundStars();
    $("#game-level").textContent = `Stufe ${level + 1}`;
    const text = instruction();
    $("#game-instruction").textContent = text.text;
    $("#cue-text").textContent = [text.speech, game.question.cue]
      .filter(Boolean)
      .join(" · ");
    $("#adult-cue").open = false;
    $("#adult-cue").hidden = true;
    $("#speech-notice").hidden = true;
    renderTask();
    // Sound files still play without a voice; speak() then shows the reading aid.
    if (state.settings.autoSpeak) speakTask();
    else if (!speechAvailable())
      revealSpeechFallback(
        "Hier gibt es gerade keine deutsche Stimme. Bitte einen Erwachsenen, dir vorzulesen.",
      );
    $("#game-title").focus({ preventScroll: true });
    $(".game-card").scrollIntoView({ block: "nearest", behavior: "instant" });
    if (activeMilliseconds >= 5 * 60 * 1000 && !pauseSuggested) suggestPause();
  }
  function listenButton(label) {
    return `<button class="big-listen" id="content-listen"><span aria-hidden="true">🔊</span> ${label}</button>`;
  }
  function abcHelp(letters) {
    return `<div class="abc-help" id="abc-help" hidden><span class="abc-help-label">ABC-Hilfe</span>${[...letters].map((letter) => `<span class="abc-help-letter">${letterMarkup(letter)}</span>`).join("")}</div>`;
  }
  function renderTask() {
    const q = game.question;
    const task = $("#task-area");
    const mode = game.mode;
    task.dataset.mode = mode;
    if (mode === "type") {
      task.innerHTML = `${listenButton("Buchstaben anhören")}<div class="letter-keyboard${q.keys.length > 12 ? " full" : ""}">${q.keys.map((letter) => letterButton(letter, q.lower)).join("")}</div>`;
    } else if (mode === "initial" && q.reverse) {
      task.innerHTML = `<div class="word-picture no-picture" id="word-picture" aria-hidden="true">👂</div>${listenButton("Laut anhören")}${pictureChoices(q.pictures.map((item) => ({ value: item.initial, word: item.word, icon: item.icon })))}`;
    } else if (mode === "merk") {
      // Spelling units like "Qu" or "chs" are shown exactly as written.
      task.innerHTML = `<div class="word-picture${q.picture ? "" : " no-picture"}" id="word-picture" aria-hidden="true">${q.picture ? q.icon : "👂"}</div>${listenButton("Wort anhören")}<div class="merk-word" aria-label="Wort mit Lücke">${q.before}<span class="merk-gap" id="merk-gap">?</span>${q.after}</div><div class="answer-choices">${q.choices.map((unit) => `<button class="letter-button merk-choice" data-answer="${unit}" aria-label="${unit}">${unit}</button>`).join("")}</div><p class="merk-tip" id="merk-tip" hidden></p>`;
    } else if (mode === "blend") {
      task.innerHTML = `<div class="blend-stage" id="blend-stage"><span class="blend-wand" aria-hidden="true">🪄</span><span class="sound-dots" aria-hidden="true">${q.sounds.map((_, i) => `<span class="sound-dot" data-dot="${i}"></span>`).join("")}</span></div>${listenButton("Laute anhören")}${pictureChoices(q.choices.map((item) => ({ value: item.word, word: item.word, icon: item.icon })), q.written)}`;
    } else if (mode === "initial") {
      task.innerHTML = `<div class="word-picture${q.picture ? "" : " no-picture"}" id="word-picture" aria-hidden="true">${q.picture ? q.icon : "👂"}</div>${listenButton("Wort anhören")}<div class="answer-choices">${q.choices.map((letter) => letterButton(letter)).join("")}</div>`;
    } else if (mode === "missing") {
      task.innerHTML = `<div class="letter-row">${q.row.map((letter, i) => `<span class="letter-tile${letter ? "" : " hole"}" data-slot="${i}">${letter ? letterMarkup(letter) : '<span aria-label="Lücke">?</span>'}</span>`).join("")}</div><div class="answer-choices">${q.choices.map((letter) => letterButton(letter)).join("")}</div>${abcHelp(q.help)}`;
    } else if (mode === "neighbor") {
      const tile = (letter) =>
        `<span class="letter-tile large">${letterMarkup(letter)}</span>`;
      const hole =
        '<span class="letter-tile large hole" aria-label="Gesuchter Buchstabe">?</span>';
      const row =
        q.dir === "between"
          ? tile(q.left) + hole + tile(q.right)
          : q.dir === "after"
            ? tile(q.target) + hole
            : hole + tile(q.target);
      task.innerHTML = `<div class="neighbor-question">${row}</div><div class="answer-choices">${q.choices.map((letter) => letterButton(letter)).join("")}</div>${abcHelp(q.help)}`;
    } else if (mode === "order") {
      task.innerHTML = `<div class="order-slots" aria-label="Deine Reihe">${[...q.answer].map((_, i) => `<div class="order-slot" aria-label="Platz ${i + 1}, noch leer"><span>${i + 1}</span></div>`).join("")}</div><div class="order-cards">${q.cards.map((letter) => letterButton(letter)).join("")}</div>${abcHelp(q.help)}`;
    } else if (C.MATH_GAMES.includes(mode)) {
      task.innerHTML = M.markup(q, listenButton);
      if (mode === "build") {
        M.renderBuilt(task, game.built, false);
        $$("#task-area [data-build]").forEach((button) =>
          button.addEventListener("click", () => {
            if (game.answered) return;
            const place = button.dataset.build;
            game.built[place] = Math.max(
              0,
              Math.min(9, game.built[place] + Number(button.dataset.step)),
            );
            M.renderBuilt(task, game.built, false);
          }),
        );
        $("#build-done").addEventListener("click", () => checkBuild($("#build-done")));
      }
    } else {
      const icon = { memory: "🎒", echo: "🦜", movement: "👏" }[mode];
      task.innerHTML = `<div class="echo-symbol" aria-hidden="true">${icon}</div>${listenButton("Anhören")}<p class="together-note"><span aria-hidden="true">👥</span> Ein Erwachsener hört zu und entscheidet.</p><div class="self-check"><button id="echo-done" class="button primary">✓ Hat geklappt</button><button id="echo-retry" class="button secondary">↺ Noch nicht ganz</button></div><button id="compare-echo" class="text-button" aria-expanded="false">Lösung zeigen</button><div id="echo-answer" hidden>${compareMarkup()}</div>`;
      $("#echo-done").addEventListener("click", () => solved());
      $("#echo-retry").addEventListener("click", () => mistake(null));
      $("#compare-echo").addEventListener("click", () => {
        const answer = $("#echo-answer");
        answer.hidden = !answer.hidden;
        $("#compare-echo").setAttribute("aria-expanded", String(!answer.hidden));
        $("#compare-echo").textContent = answer.hidden
          ? "Lösung zeigen"
          : "Lösung verstecken";
      });
    }
    $("#content-listen")?.addEventListener("click", () =>
      speak(q.speech, $("#content-listen")),
    );
    $$("#task-area [data-answer]").forEach((button) =>
      button.addEventListener("click", () => answer(button.dataset.answer, button)),
    );
  }
  function checkBuild(button) {
    if (!game || game.answered) return;
    const q = game.question;
    const { tens, ones } = game.built;
    if (tens === q.target.tens && ones === q.target.ones) return solved();
    if (q.swap && String(ones * 10 + tens) === q.answer) game.swaps++;
    mistake(null, button, String(tens * 10 + ones));
  }
  // Picture (or word) cards; the word is the accessible name, shown as text when written.
  function pictureChoices(items, written = false) {
    return `<div class="picture-choices${written ? " written" : ""}">${items.map((item) => `<button class="picture-button" data-answer="${item.value}" aria-label="${item.word}">${written ? `<span class="choice-word">${item.word}</span>` : `<span class="choice-icon" aria-hidden="true">${item.icon}</span><span class="choice-caption">${item.word}</span>`}</button>`).join("")}</div>`;
  }
  function compareMarkup() {
    const q = game.question;
    if (game.mode === "movement")
      return `<div class="sequence-cards">${q.expected.map((move, i) => `<div class="sequence-card"><span class="sequence-number">${i + 1}</span><span class="move-icon" aria-hidden="true">${move.icon}</span>${move.word}</div>`).join("")}</div>`;
    const items = game.mode === "memory" ? q.expected : q.parts;
    return `<div class="sequence-cards">${items.map((word) => `<span class="sequence-card">${word}</span>`).join("")}</div>`;
  }

  function answer(letter, button) {
    if (!game || game.answered) return;
    const q = game.question;
    if (game.mode === "order" || game.mode === "sort") {
      const numbers = game.mode === "sort";
      const sequence = numbers ? q.order : [...q.answer];
      const expected = sequence[game.filled.length];
      if (letter !== expected) return mistake(null, button, letter);
      const slot = $$(".order-slot")[game.filled.length];
      slot.classList.add("filled");
      if (numbers) slot.textContent = letter;
      else slot.innerHTML = letterMarkup(letter);
      slot.setAttribute(
        "aria-label",
        `Platz ${game.filled.length + 1}: ${numbers ? letter : displayLetter(letter)}`,
      );
      game.filled.push(letter);
      button.disabled = true;
      if (game.filled.length === sequence.length) return solved();
      $("#task-area [data-answer]:not(:disabled)")?.focus({ preventScroll: true });
      return;
    }
    if (game.mode === "missing") {
      const index = q.row.findIndex(
        (value, i) =>
          value === null && q.full[i] === letter && !game.filled.includes(i),
      );
      if (index < 0) return mistake(button, button, letter);
      const hole = $(`[data-slot="${index}"]`);
      hole.innerHTML = letterMarkup(letter);
      hole.classList.remove("hole");
      hole.classList.add("found");
      game.filled.push(index);
      button.disabled = true;
      button.classList.add("chosen");
      // The chosen letter is heard as its sound (never as its name).
      const sound = C.AMBIGUOUS_LAUTE.includes(letter) ? null : letter;
      if (game.filled.length === q.answers.length) {
        game.tapLaut = sound;
        return solved();
      }
      if (sound) speak([{ laut: sound }]);
      return;
    }
    const alternative = q.accept?.includes(letter);
    if (letter !== q.answer && !alternative) {
      // Swapped tens and ones (74 for 47) are counted for the parents' report.
      if (C.MATH_GAMES.includes(game.mode) && letter === q.swap) game.swaps++;
      return mistake(button, button, letter);
    }
    button?.classList.add("chosen");
    if (alternative) game.alternative = letter;
    if (C.MATH_GAMES.includes(game.mode)) M.reveal(q, $("#task-area"), letter);
    if (game.mode === "neighbor") {
      const hole = $(".neighbor-question .hole");
      hole.innerHTML = letterMarkup(letter);
      hole.classList.replace("hole", "found");
    }
    if (game.mode === "initial" && !q.picture) {
      $("#word-picture").textContent = q.icon;
      $("#word-picture").classList.remove("no-picture");
    }
    if (game.mode === "merk") {
      $("#merk-gap").textContent = q.answer;
      $("#merk-gap").classList.add("found");
      // The rule now appears in Momo's feedback; no need to show it twice.
      $("#merk-tip").hidden = true;
      if (!q.picture) $("#word-picture").textContent = q.icon;
    }
    if (game.mode === "blend")
      $("#blend-stage").innerHTML = `<span class="blend-result"><span aria-hidden="true">${q.icon}</span>${q.answer}</span>`;
    solved();
  }

  // Help comes in steps: a hint first, then visible support.
  function mistake(disable, shake = disable, picked = null) {
    if (!game || game.answered) return;
    game.mistakes++;
    if (picked) game.wrongPicks.push(picked);
    const q = game.question;
    const n = game.mistakes;
    if (disable) {
      disable.disabled = true;
      disable.classList.add("wrong");
    }
    if (shake && shake !== disable) {
      shake.classList.remove("shake");
      void shake.offsetWidth;
      shake.classList.add("shake");
    }
    let message;
    let replay = null;
    if (game.mode === "type") {
      message =
        n === 1
          ? "Das war ein anderer. Hör noch einmal genau hin!"
          : n === 2
            ? "Fast! Hör ganz genau hin."
            : "Schau mal, welcher Buchstabe leuchtet?";
      replay = q.speech;
      if (n >= 3) $(`#task-area [data-answer="${q.answer}"]`)?.classList.add("hint");
    } else if (game.mode === "initial" && q.reverse) {
      replay = q.speech;
      if (n === 1) message = "Hör noch einmal genau hin!";
      else {
        // Name the pictures, then play the sound again to compare.
        message = "Sag die Wörter leise. Welches fängt so an?";
        $(".picture-choices").classList.add("labeled");
        replay = [
          ...$$("#task-area [data-answer]:not(:disabled)").map(
            (button) => button.getAttribute("aria-label"),
          ),
          "Und so klingt der Laut:",
          q.speech,
        ];
      }
    } else if (game.mode === "initial") {
      replay = q.speech;
      if (n === 1) message = "Hör genau auf den Anfang des Wortes!";
      else {
        // Play the sound of every remaining card to compare with the word.
        message = "Hör dir die Laute der Karten an. Welcher passt zum Wort?";
        if (!q.picture) {
          $("#word-picture").textContent = q.icon;
          $("#word-picture").classList.remove("no-picture");
        }
        replay = [
          q.speech,
          ...$$("#task-area [data-answer]:not(:disabled)").map((button) => ({
            laut: button.dataset.answer,
            highlight: `[data-answer="${button.dataset.answer}"]`,
            gap: 700,
          })),
        ];
      }
    } else if (game.mode === "merk") {
      // First listen again, then the spelling rule as a written and spoken tip.
      const rule = C.MERK_RULES[q.rule];
      replay = q.speech;
      if (n === 1) message = "Das ist ein Merkwort: Man schreibt es anders, als man es hört. Hör noch einmal hin!";
      else {
        message = `Tipp: ${rule.text}`;
        $("#merk-tip").textContent = rule.text;
        $("#merk-tip").hidden = false;
        setFeedback(message, "try-again");
        autoSpeak([`Tipp: ${rule.speech}`, q.speech]);
        return;
      }
    } else if (C.MATH_GAMES.includes(game.mode)) {
      const hint = M.hint(q, n, picked, $("#task-area"), game.built);
      setFeedback(hint.text, "try-again");
      autoSpeak([hint.speech, q.speech]);
      return;
    } else if (game.mode === "blend") {
      // Shorter pauses melt the sounds together.
      message =
        n === 1
          ? "Hör noch einmal genau hin!"
          : "Jetzt zaubert Momo die Laute schneller. Hör gut zu!";
      replay = n === 1 ? q.speech : q.speech.map((part) => ({ ...part, gap: 40 }));
    } else if (["missing", "neighbor", "order"].includes(game.mode)) {
      // Say clearly that the last pick was wrong and another letter is right.
      // The text names the letter; the voice plays its sound instead.
      const shown = picked ? displayLetter(picked) : "";
      const again = n > 1 ? " auch" : "";
      const wrong =
        game.mode === "missing"
          ? `passt${again} nicht. Ein anderer Buchstabe gehört in ${q.answers.length - game.filled.length > 1 ? "eine der Lücken" : "die Lücke"}.`
          : game.mode === "neighbor"
            ? `ist es${again} nicht. Ein anderer Buchstabe ist richtig.`
            : "kommt noch nicht dran. Ein anderer Buchstabe ist zuerst an der Reihe.";
      const next =
        n === 1
          ? {
              missing: "Sag die Reihe leise auf: Wo stockst du?",
              neighbor: "Sag das ABC leise auf: Welcher Buchstabe passt?",
              order: q.reverse
                ? "Welcher Buchstabe kommt im ABC ganz zuletzt?"
                : "Welcher Buchstabe kommt im ABC zuerst?",
            }[game.mode]
          : "Schau ins ABC. Das hilft dir!";
      message = `${shown} ${wrong} ${next}`.trim();
      if (n >= 2) $("#abc-help").hidden = false;
      setFeedback(message, "try-again");
      const sound = picked && !C.AMBIGUOUS_LAUTE.includes(picked) ? picked : null;
      const spokenWrong = `${sound ? "Der" : "Dieser Buchstabe"} ${wrong} ${next}`;
      if (state.settings.autoSpeak)
        speak([...(sound ? [{ laut: sound }] : []), spokenWrong]);
      else if (sound) speak([{ laut: sound }]);
      return;
    } else {
      message = "Kein Problem! Hör noch einmal gut zu und versuch es nochmal.";
      replay = q.speech;
    }
    setFeedback(message, "try-again");
    autoSpeak([
      message.replace(/[^\p{L}\p{N}\s.,!?–]/gu, ""),
      ...(Array.isArray(replay) ? replay : [replay]),
    ]);
  }

  async function solved() {
    if (!game || game.answered) return;
    const current = game;
    game.answered = true;
    $$("#task-area button:not(#content-listen)").forEach((button) => {
      button.disabled = true;
    });
    const firstTry = game.mistakes === 0;
    game.tasks++;
    if (firstTry) game.hits++;
    const step = C.progress(
      game.mode,
      state.levels[game.mode],
      firstTry,
      game.missStreak,
    );
    game.missStreak = step.missStreak;
    const finished = C.roundFinished(game.hits, game.tasks);
    stopSpeech();
    const q = game.question;
    const asked =
      game.mode === "missing"
        ? q.answers
        : game.mode === "order"
          ? [...q.answer]
          : ["type", "initial", "neighbor"].includes(game.mode)
            ? [q.answer]
            : [];
    const task = {
      mode: game.mode,
      level: step.level,
      startLevel: state.levels[game.mode],
      firstTry,
      mistakes: game.mistakes,
      ms: Date.now() - game.taskStart,
      letters: asked,
      group: q.group,
      confusions: ["type", "initial"].includes(game.mode)
        ? game.wrongPicks.map((picked) => [q.answer, picked])
        : [],
      swaps: game.swaps,
    };
    await save((latest) => {
      C.recordTask(latest, task, Date.now());
      if (firstTry) {
        latest.stars++;
        latest.totalStars++;
      }
      latest.levels[current.mode] = step.level;
      if (finished) {
        latest.rounds++;
        C.cheerPet(latest, Date.now(), 10);
      }
    });
    if (game !== current) return;
    let message;
    if (firstTry) {
      message = praise[Math.floor(Math.random() * praise.length)];
      if (step.change === "up" && !finished)
        message += " Jetzt wird es ein bisschen kniffliger! 🚀";
    } else if (step.change === "down") {
      message = "Geschafft! Die nächste Aufgabe ist etwas leichter. 💛";
    } else {
      message = "Geschafft! Jetzt üben wir das noch einmal. 💛";
    }
    // What comes before the praise is said before it too, so voice and
    // text keep the same order.
    let praiseSpoken = [message.replace(/[^\p{L}\p{N}\s.,!?–]/gu, "")];
    let before = [];
    if (game.mode === "blend") {
      message = `${game.question.answer}! ${message}`;
      before = [`${game.question.answer}!`];
    }
    if (game.mode === "merk") {
      // After solving, the rule is said once more so it sticks.
      const rule = C.MERK_RULES[game.question.rule];
      message = `${game.question.word}: ${rule.text} ${firstTry ? message : ""}`.trim();
      before = [`${game.question.word}!`, rule.speech];
      if (!firstTry) praiseSpoken = [];
    }
    if (game.mode === "initial") {
      message = `${game.question.word} fängt mit ${displayLetter(game.question.answer)} an. ${message}`;
      before = [`${game.question.word} fängt so an:`, { laut: game.question.answer }];
    }
    // Math: say the number once more as tens and ones.
    if (q.explain) {
      message = `${q.explain.text} ${message}`;
      before = [q.explain.speech];
    }
    const spoken = [...before, ...praiseSpoken];
    if (game.alternative)
      message += ` So klingt auch ${displayLetter(game.alternative)}. Meistens schreibt man aber ${displayLetter(game.question.answer)}.`;
    setFeedback(message, "correct");
    setMomo("happy");
    updateRoundStars(firstTry);
    // Move on only after Momo has finished speaking (at most 12 s), so praise
    // like "Jetzt wird es kniffliger" is never cut off. Without narration the
    // child gets a moment to read the message.
    const tap = game.tapLaut ? [{ laut: game.tapLaut }] : [];
    const speaking = state.settings.autoSpeak
      ? speak([...tap, ...spoken])
      : tap.length
        ? speak(tap)
        : Promise.resolve();
    const readingTime =
      SUCCESS_DELAY +
      (state.settings.autoSpeak ? 0 : message.length > 30 ? 1200 : 0);
    await Promise.race([
      Promise.all([
        speaking,
        new Promise((resolve) => {
          advanceTimer = setTimeout(resolve, readingTime);
        }),
      ]),
      new Promise((resolve) => setTimeout(resolve, 12000)),
    ]);
    await new Promise((resolve) => {
      advanceTimer = setTimeout(resolve, 400);
    });
    if (game !== current) return;
    if (finished) finishRound();
    else nextTask();
  }
  function setFeedback(message, kind) {
    const element = $("#feedback");
    element.textContent = message;
    element.className = `feedback${kind ? ` ${kind} feedback-pop` : ""}`;
  }
  function setMomo(mood) {
    const element = $("#game-momo");
    if (element.dataset.mood === mood) return;
    element.innerHTML = G.momoSvg(mood);
    element.dataset.mood = mood;
  }
  function updateRoundStars(justEarned = false) {
    $("#game-stars").innerHTML = Array.from(
      { length: C.ROUND_GOAL },
      (_, i) =>
        `<span class="${i < game.hits ? "earned" : "empty"}${justEarned && i === game.hits - 1 ? " pop" : ""}" aria-hidden="true">★</span>`,
    ).join("");
    $("#game-stars").setAttribute(
      "aria-label",
      `${game.hits} von ${C.ROUND_GOAL} Sternen`,
    );
  }
  function finishRound() {
    const { hits, mode, startLevel, startingTotal } = game;
    const unlocked = C.newlyUnlocked(startingTotal, state.totalStars);
    const level = state.levels[mode];
    $("#result-title").textContent =
      hits === C.ROUND_GOAL ? "Super gemacht!" : "Gut geübt!";
    $("#result-stars").innerHTML = Array.from(
      { length: C.ROUND_GOAL },
      (_, i) => `<span class="${i < hits ? "earned" : "empty"}">★</span>`,
    ).join("");
    const parts = [
      `Du hast ${hits} ${hits === 1 ? "Stern" : "Sterne"} gesammelt.`,
    ];
    if (level > startLevel) parts.push(`Du bist jetzt auf Stufe ${level + 1}! 🚀`);
    parts.push(
      hits ? "Damit kannst du Momo etwas pflanzen. 🌱" : "Momo hat dir zugeschaut und freut sich. 💛",
    );
    $("#result-description").textContent = parts.join(" ");
    $("#result-momo").innerHTML = G.momoSvg("happy");
    $("#unlocked-rewards").innerHTML = unlocked
      .map(
        (reward) =>
          `<div class="new-reward"><span aria-hidden="true">${reward.icon}</span><strong>Neu: ${reward.name}!</strong></div>`,
      )
      .join("");
    $("#play-again").dataset.activity = mode;
    showView("result");
  }
  function suggestPause() {
    pauseSuggested = true;
    $("#pause-banner").hidden = false;
  }

  /* ---------- Settings ---------- */
  function openSettings() {
    stopSpeech();
    $("#settings-dialog").showModal();
    G.setActive(false);
    updateVoices();
    $("#speech-rate").value = String(state.settings.rate);
    $("#auto-speak").checked = state.settings.autoSpeak;
    $("#lowercase").checked = state.settings.lowercase;
    $("#reset-confirm").hidden = true;
    renderLevelSettings();
    $("#laute-grid").innerHTML = [...C.ALPHABET]
      .map(
        (letter) =>
          `<button class="laut-button${C.AMBIGUOUS_LAUTE.includes(letter) ? " ambiguous" : ""}" data-laut="${letter}" aria-label="Laut ${letter} anhören">${letter}</button>`,
      )
      .join("");
  }
  $("#laute-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-laut]");
    if (!button) return;
    const letter = button.dataset.laut;
    const laut = C.LAUTE[letter];
    $("#laut-info").textContent = `${letter}: „${laut.say}“ wie am Anfang von „${laut.example}“`;
    speak([{ laut: letter }], button);
  });
  function renderLevelSettings() {
    const row = (activity) =>
      `<label class="level-row"><span>${activity.icon} ${activity.title}</span><select data-level-for="${activity.id}">${C.LEVELS[activity.id].map((level, i) => `<option value="${i}"${state.levels[activity.id] === i ? " selected" : ""}>Stufe ${i + 1}: ${level.label}</option>`).join("")}</select></label>`;
    $("#level-settings").innerHTML = C.SUBJECTS.map(
      (subject) =>
        `<h4 class="level-group">${subject.icon} ${subject.title}</h4>${C.ACTIVITIES.filter(
          (activity) => C.categoryOf(activity.id)?.subject === subject.id,
        )
          .map(row)
          .join("")}`,
    ).join("");
  }
  $("#level-settings").addEventListener("change", (event) => {
    const select = event.target.closest("[data-level-for]");
    if (!select) return;
    const mode = select.dataset.levelFor;
    const level = Number(select.value);
    save((latest) => {
      latest.levels[mode] = C.clampLevel(mode, level);
    });
  });

  /* ---------- Events ---------- */
  document.addEventListener("click", (event) => {
    const subject = event.target.closest("[data-subject]");
    if (subject) openMenu(subject.dataset.subject);
    const category = event.target.closest("[data-category]");
    if (category) openMenu(menu.subject, category.dataset.category);
    const activity = event.target.closest("[data-activity]");
    if (activity) beginGame(activity.dataset.activity);
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) showView(viewButton.dataset.view);
  });
  document.addEventListener("keydown", (event) => {
    if (
      currentView !== "game" ||
      game?.mode !== "type" ||
      game.answered ||
      $("#settings-dialog").open ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      event.target.closest("input, select, textarea")
    )
      return;
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      const letter = event.key.toUpperCase();
      const button = $(`#task-area [data-answer="${letter}"]`);
      if (button?.disabled) return;
      answer(letter, button);
    }
  });
  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    showView("home");
  });
  $("#listen-button").addEventListener("click", () =>
    speakTask($("#listen-button")),
  );
  $("#leave-game").addEventListener("click", () => openMenuFor(game?.mode));
  $("#other-game").addEventListener("click", () =>
    openMenuFor($("#play-again").dataset.activity),
  );
  $("#menu-back").addEventListener("click", () => {
    if (menu.category) openMenu(menu.subject);
    else showView("home");
  });
  $("#parents-button").addEventListener("click", openSettings);
  $("#open-report").addEventListener("click", () => {
    $("#settings-dialog").close();
    showView("report");
  });
  $("#print-report").addEventListener("click", () => window.print());
  $("#close-settings").addEventListener("click", () =>
    $("#settings-dialog").close(),
  );
  $("#settings-dialog").addEventListener("close", () => {
    stopSpeech();
    G.setActive(currentView === "garden");
    refresh();
  });
  $("#voice-select").addEventListener("change", (event) => {
    const voice = event.target.value;
    stopSpeech();
    save((latest) => {
      latest.settings.voice = voice;
    });
  });
  $("#speech-rate").addEventListener("change", (event) => {
    const rate = Number(event.target.value);
    save((latest) => {
      latest.settings.rate = rate;
    });
  });
  $("#auto-speak").addEventListener("change", (event) => {
    const value = event.target.checked;
    if (!value) stopSpeech();
    save((latest) => {
      latest.settings.autoSpeak = value;
    });
  });
  $("#lowercase").addEventListener("change", async (event) => {
    const lowercase = event.target.checked;
    await save((latest) => {
      latest.settings.lowercase = lowercase;
    });
    $$(".letter").forEach((element) => {
      if (!game?.question?.lower)
        element.textContent = displayLetter(element.dataset.letter);
    });
  });
  $("#test-voice").addEventListener("click", () =>
    speak([
      "Hallo! Ich bin Momo. Hör mal, so fängt Maus an:",
      { laut: "M" },
    ]),
  );
  $("#reset-progress").addEventListener("click", () => {
    $("#reset-confirm").hidden = false;
    $("#cancel-reset").focus();
  });
  $("#cancel-reset").addEventListener("click", () => {
    $("#reset-confirm").hidden = true;
    $("#reset-progress").focus();
  });
  $("#confirm-reset").addEventListener("click", async () => {
    activeMilliseconds = 0;
    pauseSuggested = false;
    await save((latest) => {
      const fresh = C.defaultState();
      fresh.settings = latest.settings;
      Object.assign(latest, fresh);
    });
    $("#settings-dialog").close();
    showView("home");
  });
  $("#take-break").addEventListener("click", () => {
    activeMilliseconds = 0;
    pauseSuggested = false;
    showView("home");
  });
  $("#dismiss-break").addEventListener("click", () => {
    $("#pause-banner").hidden = true;
  });
  document.addEventListener("visibilitychange", () => {
    lastTick = Date.now();
    if (document.hidden) stopSpeech();
  });
  window.addEventListener("pagehide", stopSpeech);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      state = C.sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return;
    }
    refresh();
  });
  setInterval(() => {
    const now = Date.now();
    if (
      currentView === "game" &&
      !document.hidden &&
      !$("#settings-dialog").open
    ) {
      activeMilliseconds += Math.min(now - lastTick, 2000);
      if (activeMilliseconds >= 5 * 60 * 1000 && !pauseSuggested)
        suggestPause();
    }
    lastTick = now;
  }, 1000);
  if ("speechSynthesis" in window)
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);

  G.init({ getState: () => state, save });
  // Read-only hook for the automated browser tests.
  window.WieseDebug = {
    get question() {
      return game?.question || null;
    },
    played: playedLaute,
  };
  updateVoices();
  refresh();
})();
