
/* =========================================================
   CODEQUESTER — COMPACT MOBILE TAPE DECK
   CQMusic catalog + Mackinthedark live radio

   M = Play / Pause
   N = Next track

   Requires:
   music.js before tapedeck.js

   Radio errors are diagnosed instead of being hidden behind
   a generic "Radio unavailable" message.
   ========================================================= */

(() => {
  "use strict";

  if (!window.CQMusic) {
    console.error(
      "CodeQuestER Tape Deck: music.js must load first."
    );
    return;
  }

  if (window.CQTapeDeck) {
    console.warn("CodeQuestER Tape Deck is already initialized.");
    return;
  }

  const M = window.CQMusic;
  const songs = M.getCatalog() || [];

  const RADIO_URL =
    "https://listen.streamaudio.co/proxy/mackinthedark/stream";

  const CYAN = "#00eaff";
  const GREEN = "#22ff66";

  const game = window.CQGame;
  const mobile = window.matchMedia("(max-width: 600px)");

  let current = -1;
  let state = "stopped";
  let mode = "music";
  let open = false;
  let playToken = 0;
  let radioMessage = "Live radio";
  let radioStarting = false;

  const radio = new Audio();

  radio.preload = "none";
  radio.src = RADIO_URL;

  /* ---------------------------------------------------------
     ELEMENT HELPERS
     --------------------------------------------------------- */

  function el(tag, css, text) {
    const node = document.createElement(tag);

    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function button(label, accessibleName, handler) {
    const b = el("button", `
      flex-shrink:0;
      min-width:34px;
      height:36px;
      padding:0 7px;
      border:1px solid rgba(0,234,255,.4);
      border-radius:8px;
      background:#07111b;
      color:#fff;
      font-size:15px;
      font-weight:bold;
      cursor:pointer;
      touch-action:manipulation;
    `, label);

    b.type = "button";
    b.title = accessibleName;
    b.setAttribute("aria-label", accessibleName);

    b.addEventListener("click", () => {
      try {
        const result = handler();

        if (result && typeof result.catch === "function") {
          result.catch(error => {
            console.error("Tape Deck action failed:", error);
          });
        }
      } catch (error) {
        console.error("Tape Deck action failed:", error);
      }

      b.blur();
    });

    return b;
  }

  /* ---------------------------------------------------------
     PLAYER LAYOUT
     --------------------------------------------------------- */

  const wheelUp = !!(
    game &&
    game.ui &&
    game.ui.wheelOn
  );

  const root = el("div", `
    position:fixed;
    left:50%;
    bottom:${wheelUp ? 174 : (mobile.matches ? 72 : 18)}px;
    transform:translateX(-50%);
    width:min(340px,calc(100vw - 16px));
    box-sizing:border-box;
    z-index:40;
    color:#fff;
    font-family:Arial,Helvetica,sans-serif;
    user-select:none;
    -webkit-user-select:none;
  `);

  const bar = el("div", `
    display:flex;
    align-items:center;
    gap:5px;
    padding:5px;
    border:1px solid rgba(0,234,255,.45);
    border-radius:12px;
    background:rgba(3,9,17,.94);
    box-shadow:0 4px 18px rgba(0,0,0,.4);
    backdrop-filter:blur(10px);
    -webkit-backdrop-filter:blur(10px);
  `);

  const list = el("div", `
    display:none;
    max-height:30vh;
    overflow-y:auto;
    margin-bottom:6px;
    border:1px solid rgba(0,234,255,.4);
    border-radius:10px;
    background:rgba(3,9,17,.97);
    -webkit-overflow-scrolling:touch;
  `);

  const listButton = button(
    "≡",
    "Show music tracklist",
    () => {
      open = !open;
      render();
    }
  );

  const sourceButton = button(
    "CQ",
    "Switch between songs and live radio",
    switchSource
  );

  sourceButton.style.fontSize = "11px";
  sourceButton.style.minWidth = "38px";

  const prevButton = button(
    "|◀",
    "Previous track",
    () => step(-1)
  );

  const playButton = button(
    "▶",
    "Play or pause",
    togglePlay
  );

  const nextButton = button(
    "▶|",
    "Next track",
    () => step(1)
  );

  const info = el("div", `
    flex:1;
    min-width:0;
    overflow:hidden;
    line-height:1.25;
  `);

  const heading = el("div", `
    overflow:hidden;
    white-space:nowrap;
    text-overflow:ellipsis;
    font-size:9px;
    letter-spacing:1px;
    color:${CYAN};
  `);

  const title = el("div", `
    overflow:hidden;
    white-space:nowrap;
    text-overflow:ellipsis;
    font-size:12px;
    font-weight:bold;
    margin-top:3px;
  `, "Choose a track");

  info.append(heading, title);

  bar.append(
    listButton,
    info,
    sourceButton,
    prevButton,
    playButton,
    nextButton
  );

  root.append(list, bar);
  document.body.appendChild(root);

  /* ---------------------------------------------------------
     RADIO DIAGNOSTICS
     --------------------------------------------------------- */

  function getRadioError(error) {
    if (error && error.name === "NotAllowedError") {
      return "Tap PLAY to allow audio";
    }

    if (error && error.name === "NotSupportedError") {
      return "Unsupported audio format";
    }

    if (error && error.name === "AbortError") {
      return "Playback interrupted — retry";
    }

    const mediaError = radio.error;

    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          return "Playback was interrupted";

        case MediaError.MEDIA_ERR_NETWORK:
          return "Network error — check stream";

        case MediaError.MEDIA_ERR_DECODE:
          return "Audio decoding error";

        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          return "Stream format or URL unsupported";

        default:
          return "Radio error " + mediaError.code;
      }
    }

    if (!navigator.onLine) {
      return "Device is offline";
    }

    return "Radio connection failed — retry";
  }

  function logRadioError(error) {
    console.error("CodeQuestER live radio diagnostics:", {
      requestedURL: RADIO_URL,
      currentURL: radio.currentSrc,
      errorName: error ? error.name : null,
      errorMessage: error ? error.message : null,
      mediaErrorCode: radio.error ? radio.error.code : null,
      mediaErrorMessage: radio.error ? radio.error.message : null,
      networkState: radio.networkState,
      readyState: radio.readyState,
      online: navigator.onLine
    });
  }

  /* ---------------------------------------------------------
     SOURCE SWITCHING
     --------------------------------------------------------- */

  function pauseMusic() {
    if (state === "playing") {
      M.toggle();
      state = "paused";
    }

    playToken++;
  }

  function switchSource() {
    if (mode === "music") {
      pauseMusic();

      mode = "radio";
      radioMessage = radio.paused
        ? "Live radio — press PLAY"
        : "Connecting to live radio";

      render();
      return;
    }

    radioStarting = false;
    radio.pause();

    mode = "music";
    radioMessage = "Live radio";
    render();
  }

  /* ---------------------------------------------------------
     MUSIC PLAYBACK
     --------------------------------------------------------- */

  function playIndex(index) {
    if (!songs.length) {
      render("No music tracks found");
      return;
    }

    radioStarting = false;
    radio.pause();

    mode = "music";
    current = (index + songs.length) % songs.length;
    state = "playing";

    const token = ++playToken;

    render("Loading track…");

    Promise.resolve(M.playFullSong(songs[current].id))
      .then(ok => {
        if (token !== playToken) return;

        if (ok === false) {
          state = "stopped";
          render("Track could not play");
          return;
        }

        state = "playing";
        render();
      })
      .catch(error => {
        if (token !== playToken) return;

        console.error("CodeQuestER music playback error:", error);

        state = "stopped";
        render("Music playback error");
      });
  }

  function step(direction) {
    if (!songs.length) {
      render("No music tracks found");
      return;
    }

    const nextIndex = current < 0
      ? (direction > 0 ? 0 : songs.length - 1)
      : current + direction;

    playIndex(nextIndex);
  }

  /* ---------------------------------------------------------
     RADIO PLAYBACK
     --------------------------------------------------------- */

  async function startRadio() {
    if (radioStarting) return;

    radioStarting = true;
    radioMessage = "Connecting to live radio…";
    render();

    try {
      /*
       * Start playback directly from the button interaction.
       * No crossOrigin mode is imposed on the audio stream.
       */
      await radio.play();

      radioStarting = false;
      radioMessage = "On air";
      render();

      console.log(
        "CodeQuestER radio playback started:",
        radio.currentSrc
      );
    } catch (error) {
      radioStarting = false;
      radioMessage = getRadioError(error);

      logRadioError(error);
      render();
    }
  }

  function toggleRadio() {
    if (!radio.paused && !radio.error) {
      radio.pause();
      radioMessage = "Live radio paused";
      render();
      return;
    }

    // Retry after an earlier failure.
    if (radio.error) {
      radioMessage = "Retrying radio…";
      radio.removeAttribute("src");
      radio.load();
      radio.src = RADIO_URL;
    }

    startRadio();
  }

  /* ---------------------------------------------------------
     PLAY / PAUSE
     --------------------------------------------------------- */

  function togglePlay() {
    if (mode === "radio") {
      return toggleRadio();
    }

    if (state === "stopped") {
      playIndex(current < 0 ? 0 : current);
      return;
    }

    const result = M.toggle();

    if (result && typeof result.then === "function") {
      result
        .then(ok => {
          if (ok === false) {
            state = "paused";
          } else {
            state = "playing";
          }

          render();
        })
        .catch(error => {
          console.error("Music toggle failed:", error);
          state = "paused";
          render("Playback failed");
        });

      return;
    }

    state = result === false ? "paused" : "playing";
    render();
  }

  /* ---------------------------------------------------------
     RADIO EVENTS
     --------------------------------------------------------- */

  radio.addEventListener("playing", () => {
    radioStarting = false;
    radioMessage = "On air";
    render();
  });

  radio.addEventListener("pause", () => {
    radioStarting = false;

    if (mode === "radio" && !radio.error) {
      radioMessage = "Live radio paused";
    }

    render();
  });

  radio.addEventListener("waiting", () => {
    if (mode === "radio") {
      radioMessage = "Buffering live stream…";
      render();
    }
  });

  radio.addEventListener("stalled", () => {
    if (mode === "radio") {
      radioMessage = "Stream stalled — reconnecting…";
      render();
    }
  });

  radio.addEventListener("error", () => {
    radioStarting = false;

    radioMessage = getRadioError();
    logRadioError();

    if (mode === "radio") {
      render();
    }
  });

  radio.addEventListener("ended", () => {
    radioStarting = false;

    if (mode === "radio") {
      radioMessage = "Stream ended — press PLAY";
      render();
    }
  });

  window.addEventListener("online", () => {
    if (mode === "radio" && radio.paused) {
      radioMessage = "Back online — press PLAY";
      render();
    }
  });

  window.addEventListener("offline", () => {
    if (mode === "radio") {
      radioMessage = "Device is offline";
      render();
    }
  });

  /* ---------------------------------------------------------
     EXISTING MUSIC EVENTS
     --------------------------------------------------------- */

  window.addEventListener("cq:music-paused", () => {
    state = "paused";
    render();
  });

  window.addEventListener("cq:music-resumed", () => {
    state = "playing";
    render();
  });

  window.addEventListener("cq:music-ended", () => {
    if (mode === "music" && state === "playing") {
      step(1);
    }
  });

  window.addEventListener("cq:music-error", () => {
    state = "stopped";
    render("Music playback error");
  });

  /* ---------------------------------------------------------
     TRACKLIST
     --------------------------------------------------------- */

  function renderList() {
    list.textContent = "";

    if (!songs.length) {
      list.appendChild(
        el("div", `
          padding:12px;
          color:#a0aec3;
          font-size:12px;
        `, "No tracks are available.")
      );

      return;
    }

    songs.forEach((song, index) => {
      const active = index === current;

      const row = el("button", `
        display:block;
        width:100%;
        padding:10px;
        text-align:left;
        border:0;
        border-bottom:1px solid rgba(255,255,255,.08);
        background:${active
          ? "rgba(0,60,30,.65)"
          : "transparent"};
        color:${active ? GREEN : "white"};
        font-size:13px;
        cursor:pointer;
        touch-action:manipulation;
      `, `${active ? "▶ " : ""}${song.title}`);

      row.type = "button";

      row.addEventListener("click", () => {
        open = false;
        playIndex(index);
        render();
      });

      list.appendChild(row);
    });
  }

  /* ---------------------------------------------------------
     RENDER PLAYER
     --------------------------------------------------------- */

  function render(message) {
    if (mode === "radio") {
      heading.textContent = "MACKINTHEDARK · LIVE";

      title.textContent = message ||
        (radio.error
          ? getRadioError()
          : radioMessage);

      sourceButton.textContent = "LIVE";
      sourceButton.style.color = CYAN;

      playButton.textContent =
        !radio.paused && !radio.error ? "Ⅱ" : "▶";

      prevButton.style.display = "none";
      nextButton.style.display = "none";
    } else {
      const song = current >= 0 ? songs[current] : null;

      heading.textContent = "CODEQUESTER RADIO";

      title.textContent = message ||
        (song
          ? song.title
          : songs.length
            ? "Choose a track"
            : "No tracks available");

      sourceButton.textContent = "CQ";
      sourceButton.style.color = "white";

      playButton.textContent =
        state === "playing" ? "Ⅱ" : "▶";

      prevButton.style.display = "";
      nextButton.style.display = "";
    }

    listButton.style.color = open ? GREEN : "white";
    list.style.display = open ? "block" : "none";

    if (open) renderList();

    root.style.bottom =
      (wheelUp ? 174 : (mobile.matches ? 72 : 18)) + "px";
  }

  /* ---------------------------------------------------------
     KEYBOARD CONTROLS
     --------------------------------------------------------- */

  window.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const target = event.target;

    if (
      target &&
      (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
      )
    ) {
      return;
    }

    if (event.code === "KeyM") {
      togglePlay();
    }

    if (event.code === "KeyN") {
      if (mode === "music") step(1);
    }
  });

  mobile.addEventListener?.("change", render);

  /* ---------------------------------------------------------
     PUBLIC CONTROLS
     --------------------------------------------------------- */

  window.CQTapeDeck = {
    play: playIndex,
    next: () => step(1),
    prev: () => step(-1),
    toggle: togglePlay,
    openList: () => {
      open = true;
      render();
    },
    closeList: () => {
      open = false;
      render();
    },
    switchSource,
    playRadio: () => {
      if (mode !== "radio") {
        switchSource();
      }

      return startRadio();
    },
    getRadioStatus: () => ({
      mode,
      paused: radio.paused,
      error: radio.error ? {
        code: radio.error.code,
        message: radio.error.message
      } : null,
      networkState: radio.networkState,
      readyState: radio.readyState,
      currentSrc: radio.currentSrc,
      status: radioMessage
    })
  };

  render();

  console.log(
    "CodeQuestER Tape Deck initialized. Music tracks:",
    songs.length
  );
})();
