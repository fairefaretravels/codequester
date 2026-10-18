
/* =========================================================
   CODEQUESTER — COMPACT MOBILE TAPE DECK
   Existing CQMusic catalog + Mackinthedark live radio
   Keys M = play/pause, N = next
   ========================================================= */
(() => {
  "use strict";

  if (!window.CQMusic) {
    console.warn("Tape Deck: Load music.js before tapedeck.js.");
    return;
  }

  const M = window.CQMusic;
  const songs = M.getCatalog();
  const RADIO_URL =
    "https://listen.streamaudio.co/proxy/mackinthedark/stream";

  const CYAN = "#00eaff";
  const GREEN = "#22ff66";

  const game = window.CQGame;
  const wheelUp = !!(game && game.ui && game.ui.wheelOn);

  let current = -1;
  let state = "stopped";
  let mode = "music";
  let open = false;
  let playToken = 0;

  const radio = new Audio(RADIO_URL);
  radio.preload = "none";
  radio.crossOrigin = "anonymous";

  function el(tag, css, text) {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const mobile = window.matchMedia("(max-width: 600px)");

  const root = el("div", `
    position:fixed;
    left:50%;
    bottom:${wheelUp ? 174 : (mobile.matches ? 72 : 18)}px;
    transform:translateX(-50%);
    width:min(300px,calc(100vw - 20px));
    box-sizing:border-box;
    z-index:40;
    color:#fff;
    font-family:Arial,sans-serif;
    user-select:none;
  `);

  const bar = el("div", `
    display:flex;
    align-items:center;
    gap:5px;
    padding:5px;
    border:1px solid rgba(0,234,255,.45);
    border-radius:12px;
    background:rgba(3,9,17,.92);
    box-shadow:0 4px 18px rgba(0,0,0,.35);
    backdrop-filter:blur(10px);
  `);

  const list = el("div", `
    display:none;
    max-height:30vh;
    overflow-y:auto;
    margin-bottom:6px;
    border:1px solid rgba(0,234,255,.4);
    border-radius:10px;
    background:rgba(3,9,17,.96);
    -webkit-overflow-scrolling:touch;
  `);

  function button(label, title, handler) {
    const b = el("button", `
      flex-shrink:0;
      min-width:34px;
      height:36px;
      padding:0 7px;
      border:1px solid rgba(0,234,255,.4);
      border-radius:8px;
      background:#07111b;
      color:white;
      font-size:15px;
      font-weight:bold;
      cursor:pointer;
      touch-action:manipulation;
    `, label);

    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", () => {
      handler();
      b.blur();
    });
    return b;
  }

  const listButton = button("≡", "Show tracklist", () => {
    open = !open;
    render();
  });

  const sourceButton = button("CQ", "Switch music or live radio", switchSource);
  sourceButton.style.fontSize = "11px";
  sourceButton.style.minWidth = "38px";

  const prevButton = button("|◀", "Previous track", () => step(-1));
  const playButton = button("▶", "Play or pause", togglePlay);
  const nextButton = button("▶|", "Next track", () => step(1));

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
  bar.append(listButton, info, sourceButton, prevButton, playButton, nextButton);
  root.append(list, bar);
  document.body.appendChild(root);

  function pauseMusic() {
    if (state === "playing") {
      M.toggle();
      state = "paused";
    }
  }

  function switchSource() {
    if (mode === "music") {
      pauseMusic();
      mode = "radio";
    } else {
      radio.pause();
      mode = "music";
    }
    render();
  }

  function playIndex(index) {
    if (!songs.length) return;

    radio.pause();
    mode = "music";
    current = (index + songs.length) % songs.length;
    state = "playing";

    const token = ++playToken;
    render();

    Promise.resolve(M.playFullSong(songs[current].id))
      .then(ok => {
        if (token !== playToken) return;
        if (!ok) {
          state = "stopped";
          render("Track unavailable");
        }
      })
      .catch(() => {
        if (token !== playToken) return;
        state = "stopped";
        render("Track unavailable");
      });
  }

  function step(direction) {
    if (!songs.length) return;
    playIndex(current < 0
      ? (direction > 0 ? 0 : songs.length - 1)
      : current + direction);
  }

  function togglePlay() {
    if (mode === "radio") {
      if (!radio.paused) {
        radio.pause();
        render();
        return;
      }

      radio.play()
        .then(render)
        .catch(() => render("Radio unavailable"));
      render();
      return;
    }

    if (state === "stopped") {
      playIndex(current < 0 ? 0 : current);
      return;
    }

    const result = M.toggle();

    if (result && typeof result.then === "function") {
      result.then(ok => {
        if (ok) state = "playing";
        render();
      }).catch(() => render("Playback unavailable"));
      return;
    }

    state = result ? "playing" : "paused";
    render();
  }

  radio.addEventListener("playing", render);
  radio.addEventListener("pause", render);
  radio.addEventListener("error", () => {
    if (mode === "radio") render("Radio unavailable");
  });

  window.addEventListener("cq:music-paused", () => {
    state = "paused";
    render();
  });

  window.addEventListener("cq:music-resumed", () => {
    state = "playing";
    render();
  });

  window.addEventListener("cq:music-ended", () => {
    if (mode === "music" && state === "playing") step(1);
  });

  window.addEventListener("cq:music-error", () => {
    state = "stopped";
    render("Track unavailable");
  });

  function renderList() {
    list.textContent = "";

    songs.forEach((song, index) => {
      const active = index === current;

      const row = el("button", `
        display:block;
        width:100%;
        padding:10px;
        text-align:left;
        border:0;
        border-bottom:1px solid rgba(255,255,255,.08);
        background:${active ? "rgba(0,60,30,.65)" : "transparent"};
        color:${active ? GREEN : "white"};
        font-size:13px;
        cursor:pointer;
        touch-action:manipulation;
      `, `${active ? "▶ " : ""}${song.title}`);

      row.type = "button";
      row.addEventListener("click", () => {
        playIndex(index);
        open = false;
        render();
      });

      list.appendChild(row);
    });
  }

  function render(message) {
    const song = current >= 0 ? songs[current] : null;

    if (mode === "radio") {
      heading.textContent = "MACKINT HEDARK · LIVE";
      title.textContent = message ||
        (radio.error ? "Radio unavailable" :
          radio.paused ? "Live radio" : "On air");
      sourceButton.textContent = "LIVE";
      playButton.textContent = radio.paused ? "▶" : "Ⅱ";
      prevButton.style.display = "none";
      nextButton.style.display = "none";
    } else {
      heading.textContent = "CODEQUESTER RADIO";
      title.textContent = message ||
        (song ? song.title :
          songs.length ? "Choose a track" : "No tracks available");
      sourceButton.textContent = "CQ";
      playButton.textContent = state === "playing" ? "Ⅱ" : "▶";
      prevButton.style.display = "";
      nextButton.style.display = "";
    }

    listButton.style.color = open ? GREEN : "white";
    list.style.display = open ? "block" : "none";

    if (open) renderList();

    root.style.bottom =
      (wheelUp ? 174 : (mobile.matches ? 72 : 18)) + "px";
  }

  mobile.addEventListener?.("change", render);

  window.CQTapeDeck = {
    play: playIndex,
    next: () => step(1),
    prev: () => step(-1),
    toggle: togglePlay,
    openList: () => { open = true; render(); },
    closeList: () => { open = false; render(); },
    switchSource
  };

  render();
})();
