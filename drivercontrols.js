/* =========================================================
   CODEQUESTER — DRIVER CONTROLS
   Plain script (no ES modules). Load AFTER main.js and music.js.

   1) STEERING WHEEL
      Drag the wheel clockwise to turn right, counter-clockwise
      to turn left. It springs back to centre when released.
      Feeds GAME.analogSteer (-1..1); main.js reads it in
      updateSteering(). Keyboard still works when the wheel is idle.
      Replaces the LEFT / RIGHT buttons on touch screens.

   2) RADIO
      Plays songs the player OWNS (CQMusic.playFullSong), so the
      "buy full song at the record store" rule is untouched.
      Prev / Play-Pause / Next, auto-advance, keys M (play/pause)
      and N (next).

   Everything is guarded: if something is missing, the driving
   game keeps running.
   ========================================================= */
(() => {
  "use strict";

  const GAME = window.CQGame;
  if (!GAME || !GAME.ui) {
    console.warn(
      "CodeQuestER: drivercontrols.js needs main.js to load first"
    );
    return;
  }

  /* "auto" = wheel on touch screens, buttons on desktop
     "always" = wheel everywhere   "never" = old buttons only */
  const WHEEL_MODE = "auto";
  const WHEEL_SIZE = 140;
  const MAX_TURN = (125 * Math.PI) / 180;

  const CYAN = "rgba(0,234,255,.6)";
  const PANEL_BG = "rgba(0,0,0,.72)";

  function isTouch() {
    return (
      (window.matchMedia &&
        window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0
    );
  }

  /* =======================================================
     STEERING WHEEL
     ======================================================= */
  let wheelOn = false;

  function buildWheel() {
    const host = GAME.ui.steerButtons;
    const row = GAME.ui.mobile;
    if (!host || !row) {
      return;
    }

    host.innerHTML = "";
    row.style.alignItems = "flex-end";

    const wheel = document.createElement("div");
    wheel.style.width = WHEEL_SIZE + "px";
    wheel.style.height = WHEEL_SIZE + "px";
    wheel.style.borderRadius = "50%";
    wheel.style.background = "rgba(0,0,0,.35)";
    wheel.style.touchAction = "none";
    wheel.style.pointerEvents = "auto";
    wheel.style.userSelect = "none";
    wheel.style.webkitUserSelect = "none";
    wheel.setAttribute("aria-label", "Steering wheel");

    wheel.innerHTML =
      '<svg viewBox="-50 -50 100 100" width="100%" height="100%" ' +
      'style="display:block">' +
      '<g id="cq-wheel-rotor">' +
      '<circle r="44" fill="rgba(0,0,0,.72)" stroke="#00eaff" ' +
      'stroke-opacity=".6" stroke-width="7"/>' +
      '<circle r="9" fill="#0b1a24" stroke="#00eaff" ' +
      'stroke-opacity=".6" stroke-width="2"/>' +
      '<line x1="-40" y1="0" x2="-9" y2="0" stroke="#00eaff" ' +
      'stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>' +
      '<line x1="40" y1="0" x2="9" y2="0" stroke="#00eaff" ' +
      'stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>' +
      '<line x1="0" y1="9" x2="0" y2="40" stroke="#00eaff" ' +
      'stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="-3" y="-47" width="6" height="12" rx="2" ' +
      'fill="#ffd400"/>' +
      "</g></svg>";

    host.appendChild(wheel);
    const rotor = wheel.querySelector("#cq-wheel-rotor");

    let angle = 0; /* radians, + = clockwise = right */
    let dragId = null;
    let startPointer = 0;
    let startAngle = 0;
    let springFrame = 0;

    function render() {
      rotor.setAttribute(
        "transform",
        "rotate(" + (angle * 180) / Math.PI + ")"
      );
      GAME.analogSteer = angle / MAX_TURN;
    }

    function pointerAngle(event) {
      const r = wheel.getBoundingClientRect();
      return Math.atan2(
        event.clientY - (r.top + r.height / 2),
        event.clientX - (r.left + r.width / 2)
      );
    }

    function wrap(a) {
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      return a;
    }

    function spring() {
      angle *= 0.78;
      if (Math.abs(angle) < 0.01) {
        angle = 0;
        rotor.setAttribute("transform", "rotate(0)");
        GAME.analogSteer = null;
        springFrame = 0;
        return;
      }
      render();
      springFrame = requestAnimationFrame(spring);
    }

    wheel.addEventListener("pointerdown", event => {
      if (dragId !== null) {
        return;
      }
      event.preventDefault();
      dragId = event.pointerId;
      cancelAnimationFrame(springFrame);
      springFrame = 0;
      startPointer = pointerAngle(event);
      startAngle = angle;
      try {
        wheel.setPointerCapture(event.pointerId);
      } catch (e) {
        /* capture is a nicety, not required */
      }
      render();
    });

    wheel.addEventListener("pointermove", event => {
      if (event.pointerId !== dragId) {
        return;
      }
      event.preventDefault();
      const delta = wrap(pointerAngle(event) - startPointer);
      angle = Math.max(
        -MAX_TURN,
        Math.min(MAX_TURN, startAngle + delta)
      );
      render();
    });

    function release(event) {
      if (event.pointerId !== dragId) {
        return;
      }
      dragId = null;
      springFrame = requestAnimationFrame(spring);
    }
    wheel.addEventListener("pointerup", release);
    wheel.addEventListener("pointercancel", release);
    wheel.addEventListener("lostpointercapture", release);

    wheelOn = true;
  }

  if (
    WHEEL_MODE === "always" ||
    (WHEEL_MODE === "auto" && isTouch())
  ) {
    buildWheel();
  }

  /* =======================================================
     RADIO
     ======================================================= */
  const Music = window.CQMusic;
  if (!Music) {
    console.warn(
      "CodeQuestER: CQMusic not found — radio disabled"
    );
    return;
  }

  /* Make sure GAME.library / GAME.cash exist and CQMusic is
     pointed at this GAME. Safe to call more than once. */
  try {
    Music.bind(GAME);
  } catch (error) {
    console.warn("CodeQuestER: could not bind music", error);
  }

  function ownedTracks() {
    return Music.getCatalog().filter(
      song => song.full && Music.hasSong(song.id)
    );
  }

  let currentId = null;
  let expanded = false;

  /* ---------- UI ---------- */
  const radio = document.createElement("div");
  radio.style.position = "fixed";
  radio.style.left = "50%";
  radio.style.transform = "translateX(-50%)";
  radio.style.bottom =
    (wheelOn ? WHEEL_SIZE + 34 : 92) + "px";
  radio.style.zIndex = "26";
  radio.style.fontFamily = "Arial, sans-serif";
  radio.style.color = "#ffffff";
  radio.style.background = PANEL_BG;
  radio.style.border = "1px solid " + CYAN;
  radio.style.borderRadius = "12px";
  radio.style.padding = "6px 8px";
  radio.style.maxWidth = "calc(100vw - 24px)";
  radio.style.boxSizing = "border-box";
  radio.style.display = "flex";
  radio.style.alignItems = "center";
  radio.style.gap = "6px";
  radio.style.pointerEvents = "auto";
  radio.style.touchAction = "manipulation";
  radio.style.userSelect = "none";
  radio.style.webkitUserSelect = "none";

  function mkBtn(label, title) {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.style.width = "40px";
    b.style.height = "36px";
    b.style.border = "1px solid " + CYAN;
    b.style.borderRadius = "8px";
    b.style.background = "rgba(0,0,0,.6)";
    b.style.color = "#ffffff";
    b.style.fontSize = "16px";
    b.style.cursor = "pointer";
    return b;
  }

  const toggleBtn = mkBtn("\uD83D\uDCFB", "Radio");
  const prevBtn = mkBtn("\u23EE", "Previous");
  const playBtn = mkBtn("\u25B6", "Play / pause");
  const nextBtn = mkBtn("\u23ED", "Next");

  const label = document.createElement("div");
  label.style.fontSize = "12px";
  label.style.lineHeight = "1.3";
  label.style.minWidth = "0";
  label.style.maxWidth = "170px";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.whiteSpace = "nowrap";

  radio.appendChild(toggleBtn);
  radio.appendChild(prevBtn);
  radio.appendChild(playBtn);
  radio.appendChild(nextBtn);
  radio.appendChild(label);
  document.body.appendChild(radio);

  /* CQMusic exposes no "paused?" query, so track it from its
     events plus our own play calls. */
  let playing = false;

  function songText(song) {
    if (!song) {
      return "";
    }
    return song.artist
      ? song.title + " \u2014 " + song.artist
      : song.title;
  }

  function refresh() {
    const tracks = ownedTracks();
    const has = tracks.length > 0;

    [prevBtn, playBtn, nextBtn].forEach(b => {
      b.style.display = expanded ? "" : "none";
      b.disabled = !has;
      b.style.opacity = has ? "1" : "0.4";
    });
    label.style.display = expanded ? "" : "none";

    playBtn.textContent = playing ? "\u23F8" : "\u25B6";

    if (!has) {
      label.textContent =
        "No songs yet \u2014 buy some at the record store";
    } else if (currentId) {
      label.textContent = songText(Music.getSong(currentId));
    } else {
      label.textContent = "Radio off \u2014 press play";
    }
  }

  /* ---------- playback ---------- */
  function playTrack(id) {
    if (!id) {
      return Promise.resolve(false);
    }
    currentId = id;
    playing = true;
    refresh();
    return Promise.resolve(Music.playFullSong(id)).then(ok => {
      playing = !!ok;
      if (!ok) {
        console.warn(
          "CodeQuestER: radio could not play " + id
        );
      }
      refresh();
      return ok;
    });
  }

  function step(dir) {
    const tracks = ownedTracks();
    if (!tracks.length) {
      refresh();
      return;
    }
    let i = tracks.findIndex(s => s.id === currentId);
    i = i === -1 ? (dir > 0 ? 0 : tracks.length - 1)
                 : (i + dir + tracks.length) % tracks.length;
    playTrack(tracks[i].id);
  }

  function playPause() {
    const tracks = ownedTracks();
    if (!tracks.length) {
      refresh();
      return;
    }
    if (currentId && Music.getNowPlaying()) {
      Promise.resolve(Music.toggle()).then(result => {
        playing = !!result;
        refresh();
      });
      return;
    }
    const known = tracks.find(s => s.id === currentId);
    playTrack((known || tracks[0]).id);
  }

  toggleBtn.addEventListener("click", () => {
    expanded = !expanded;
    refresh();
  });
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  playBtn.addEventListener("click", playPause);

  window.addEventListener("cq:music-paused", () => {
    playing = false;
    refresh();
  });
  window.addEventListener("cq:music-resumed", () => {
    playing = true;
    refresh();
  });
  window.addEventListener("cq:music-ended", () => {
    playing = false;
    step(1); /* auto-advance, loops the owned list */
  });
  window.addEventListener("cq:library-changed", refresh);

  window.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "m") {
      expanded = true;
      playPause();
    } else if (key === "n") {
      expanded = true;
      step(1);
    }
  });

  refresh();
})();
