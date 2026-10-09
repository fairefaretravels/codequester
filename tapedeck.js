/* =========================================================
   CODEQUESTER — TAPE DECK
   Plain script (no ES modules).
   Load order: music.js, main.js, drivercontrols.js, tapedeck.js

   A small in-game player listing every song in the CQMusic
   catalog. Free play for now (see FREE_PLAY in music.js).
   Tap the list button to open the tracklist, tap a song to
   play it. Prev / play-pause / next on the bar. Songs
   auto-advance when one ends.

   Keys M (play/pause) and N (next) are wired in
   drivercontrols.js through window.CQTapeDeck.
   ========================================================= */
(() => {
  "use strict";

  if (!window.CQMusic) {
    console.warn("CodeQuestER Tape Deck: CQMusic not found. Load music.js first.");
    return;
  }

  const M = window.CQMusic;
  const songs = M.getCatalog();
  const CYAN = "rgba(0,234,255,.6)";
  const GREEN = "#22ff66";

  /* Sit above the steering wheel when drivercontrols.js built one. */
  const game = window.CQGame;
  const wheelUp = !!(game && game.ui && game.ui.wheelOn);
  const BOTTOM = wheelUp ? 174 : 92;

  let current = -1;        /* index into songs */
  let state = "stopped";   /* "stopped" | "playing" | "paused" */
  let open = false;
  let notice = "";
  let noticeTimer = null;
  let playToken = 0;

  function el(tag, css, text) {
    const node = document.createElement(tag);
    if (css) {
      node.style.cssText = css;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /* ---------------------------------------------------------
     DOM
     --------------------------------------------------------- */
  const root = el(
    "div",
    "position:fixed;left:50%;bottom:" + BOTTOM + "px;" +
    "transform:translateX(-50%);width:min(330px,calc(100vw - 24px));" +
    "box-sizing:border-box;z-index:27;font-family:Arial,sans-serif;" +
    "color:#fff;"
  );

  const list = el(
    "div",
    "display:none;max-height:36vh;overflow-y:auto;margin-bottom:6px;" +
    "background:rgba(0,0,0,.82);border:1px solid rgba(0,234,255,.4);" +
    "border-radius:10px;-webkit-overflow-scrolling:touch;"
  );

  const bar = el(
    "div",
    "display:flex;align-items:center;gap:6px;padding:6px;" +
    "background:rgba(0,0,0,.78);border:1px solid rgba(0,234,255,.4);" +
    "border-radius:10px;"
  );

  function makeButton(label, title, handler) {
    const button = el(
      "button",
      "min-width:40px;height:40px;padding:0 8px;border:1px solid " + CYAN + ";" +
      "border-radius:8px;background:rgba(0,0,0,.72);color:#fff;" +
      "font-size:16px;font-weight:bold;cursor:pointer;touch-action:manipulation;",
      label
    );
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", () => {
      handler();
      button.blur(); /* keep Space / Enter from re-triggering while driving */
    });
    return button;
  }

  const listButton = makeButton("\u2630", "Tracklist", () => {
    open = !open;
    render();
  });
  const prevButton = makeButton("\u23EE", "Previous", () => step(-1));
  const playButton = makeButton("\u25B6", "Play / pause", togglePlay);
  const nextButton = makeButton("\u23ED", "Next", () => step(1));

  const info = el("div", "flex:1;min-width:0;line-height:1.25;");
  const infoHead = el(
    "div",
    "font-size:10px;letter-spacing:1px;color:#00eaff;white-space:nowrap;" +
    "overflow:hidden;text-overflow:ellipsis;"
  );
  const infoTitle = el(
    "div",
    "font-size:14px;font-weight:bold;white-space:nowrap;" +
    "overflow:hidden;text-overflow:ellipsis;"
  );
  info.appendChild(infoHead);
  info.appendChild(infoTitle);

  bar.appendChild(listButton);
  bar.appendChild(info);
  bar.appendChild(prevButton);
  bar.appendChild(playButton);
  bar.appendChild(nextButton);

  root.appendChild(list);
  root.appendChild(bar);
  document.body.appendChild(root);

  /* ---------------------------------------------------------
     PLAYBACK
     --------------------------------------------------------- */
  function flash(text) {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice = "";
      render();
    }, 3000);
  }

  function playIndex(index) {
    if (!songs.length) {
      return;
    }

    current = (index + songs.length) % songs.length;
    state = "playing";

    const token = ++playToken;
    const song = songs[current];

    render();

    M.playFullSong(song.id).then(ok => {
      if (token !== playToken) {
        return; /* a newer tap superseded this one */
      }
      if (!ok) {
        state = "stopped";
        flash("CAN'T LOAD: " + song.title);
        render();
      }
    });
  }

  function step(direction) {
    if (current < 0) {
      playIndex(direction > 0 ? 0 : songs.length - 1);
    } else {
      playIndex(current + direction);
    }
  }

  function togglePlay() {
    if (state === "stopped") {
      playIndex(current < 0 ? 0 : current);
      return;
    }

    const result = M.toggle();

    if (result && typeof result.then === "function") {
      result.then(ok => {
        if (ok) {
          state = "playing";
        }
        render();
      });
      return;
    }

    state = result ? "playing" : "paused";
    render();
  }

  window.addEventListener("cq:music-paused", () => {
    if (state === "playing") {
      state = "paused";
      render();
    }
  });

  window.addEventListener("cq:music-resumed", () => {
    if (state === "paused") {
      state = "playing";
      render();
    }
  });

  window.addEventListener("cq:music-ended", () => {
    if (state === "playing") {
      playIndex(current + 1);
    }
  });

  window.addEventListener("cq:music-error", () => {
    if (state !== "stopped") {
      state = "stopped";
      flash("CAN'T LOAD: " + (current >= 0 ? songs[current].title : "song"));
      render();
    }
  });

  /* ---------------------------------------------------------
     RENDER
     --------------------------------------------------------- */
  function renderList() {
    list.textContent = "";

    songs.forEach((song, index) => {
      const active = index === current;

      const row = el(
        "div",
        "display:flex;align-items:center;gap:8px;padding:9px 10px;" +
        "cursor:pointer;touch-action:manipulation;" +
        "border-bottom:1px solid rgba(255,255,255,.08);" +
        (active ? "background:rgba(0,60,30,.7);" : "")
      );

      const number = el(
        "div",
        "width:22px;font-size:12px;color:" + (active ? GREEN : "#8aa") + ";",
        active
          ? (state === "playing" ? "\u25B6" : "\u275A\u275A")
          : String(index + 1).padStart(2, "0")
      );

      const text = el("div", "flex:1;min-width:0;");
      text.appendChild(
        el(
          "div",
          "font-size:14px;font-weight:bold;white-space:nowrap;" +
          "overflow:hidden;text-overflow:ellipsis;" +
          (active ? "color:" + GREEN + ";" : ""),
          song.title
        )
      );

      const sub = [song.artist, song.city].filter(Boolean).join(" \u00B7 ");
      if (sub) {
        text.appendChild(
          el(
            "div",
            "font-size:11px;color:#9ab;white-space:nowrap;" +
            "overflow:hidden;text-overflow:ellipsis;",
            sub
          )
        );
      }

      row.appendChild(number);
      row.appendChild(text);

      row.addEventListener("click", () => {
        if (index === current && state !== "stopped") {
          togglePlay();
        } else {
          playIndex(index);
        }
      });

      list.appendChild(row);
    });
  }

  function render() {
    const song = current >= 0 ? songs[current] : null;
    const total = String(songs.length).padStart(2, "0");
    const number = current >= 0
      ? String(current + 1).padStart(2, "0") + "/" + total
      : "--/" + total;

    infoHead.textContent =
      "TAPE DECK \u00B7 " + number + " \u00B7 " + state.toUpperCase();
    infoTitle.textContent =
      notice || (song ? song.title : "NO TAPE LOADED");
    infoTitle.style.color = notice ? "#ff6b6b" : "#ffffff";

    playButton.textContent = state === "playing" ? "\u275A\u275A" : "\u25B6";

    listButton.style.borderColor = open ? GREEN : CYAN;
    listButton.style.color = open ? GREEN : "#ffffff";

    list.style.display = open ? "block" : "none";
    if (open) {
      renderList();
    }
  }

  render();

  window.CQTapeDeck = {
    play: playIndex,
    next: () => step(1),
    prev: () => step(-1),
    toggle: togglePlay,
    openList: () => { open = true; render(); },
    closeList: () => { open = false; render(); }
  };
})();
