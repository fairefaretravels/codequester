/* =========================================================
   CODEQUESTER — MUSIC SYSTEM
   Catalog + ownership + lazy audio.
   Plain script (no ES modules). Exposes window.CQMusic.
   Load BEFORE drivercontrols.js and tapedeck.js.

   FREE_PLAY
   - true  : every song can be played in full (tape deck mode).
   - false : full songs require ownership (record store mode).
   Flip it to false when purchases go in. Nothing else changes.

   AUDIO RULES
   - Nothing is loaded at startup.
   - ONE shared <audio> element is created the first time
     something plays, then reused for previews and full songs.

   OWNERSHIP
   - Lives on the existing GAME object: GAME.library (song ids)
     and GAME.cash. No second player object.
   - Library is saved to localStorage. Cash is NOT saved yet.
   ========================================================= */
(() => {
  "use strict";

  const FREE_PLAY = true;
  const MUSIC_DIR = "assets/music/";
  const START_CASH = 20;
  const STORAGE_KEY = "codequester.library.v1";

  /* ---------------------------------------------------------
     CATALOG (metadata only, never ownership)
     artist / city / genre can be null when unknown.
     preview: null means no preview clip exists yet.
     File names are case-sensitive on GitHub Pages.
     --------------------------------------------------------- */
  function entry(id, title, file, extra) {
    const o = extra || {};
    return {
      id,
      artist: o.artist || null,
      title,
      city: o.city || null,
      genre: o.genre || null,
      preview: o.preview || null,
      full: MUSIC_DIR + file,
      price: 5
    };
  }

  const MUSIC_CATALOG = [
    entry("collect_the_vibe", "Collect The Vibe", "collectthevibe.mp3", {
      artist: "Lavelle feat The Switchblades",
      city: "Detroit",
      genre: "Hip-Hop"
    }),
    entry("four_x_four", "4 X 4", "4x4.mp3"),
    entry("throwback", "Throwback", "throwback.mp3", {
      artist: "AL LUV ft Switchblades"
    }),
    entry("all_dat_ass", "All Dat Ass", "alldatass.mp3"),
    entry("baby_tonight", "Baby Tonight", "babytonight.mp3", {
      city: "Miami"
    }),
    entry("drive_me", "Drive Me", "driveme.mp3", { city: "Tokyo" }),
    entry("dust_on_the_subwoofer", "Dust On The Subwoofer", "dustonthesubwoofer.mp3"),
    entry("eighteen_and_a_clutch", "Eighteen And A Clutch", "eighteenandaclutch.mp3"),
    entry("mackinthedark_all_i_have", "All I Have In This World", "allihave.mp3", {
      artist: "Mackinthedark",
      city: "Detroit",
      genre: "Hip-Hop"
    }),
    entry("gods_favorite", "God's Favorite", "godsfavorite.mp3", {
      city: "Cozumel"
    }),
    entry("try", "TRY", "try.mp3", { city: "Las Vegas" }),
    entry("i_need_you", "I Need You", "ineedyou.mp3", {
      city: "Salt Lake City"
    }),
    entry("white_smoke", "White Smoke", "whitesmoke.mp3")
  ];

  const byId = new Map();
  MUSIC_CATALOG.forEach(song => byId.set(song.id, song));

  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */
  let game = null;
  let player = null;     /* the one shared <audio>, created lazily */
  let nowPlaying = null; /* { id, kind: "full" | "preview" } */

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      /* events are optional */
    }
  }

  /* ---------------------------------------------------------
     SAVED LIBRARY
     --------------------------------------------------------- */
  function loadSavedLibrary() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) {
        return [];
      }
      return data.filter(id => byId.has(id));
    } catch (error) {
      return [];
    }
  }

  function saveLibrary() {
    if (!game) {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(game.library)
      );
    } catch (error) {
      /* private mode / blocked storage: ownership lasts this session */
    }
  }

  /* Safe to call more than once. */
  function bind(GAME) {
    game = GAME;
    if (typeof game.cash !== "number") {
      game.cash = START_CASH;
    }
    if (!Array.isArray(game.library)) {
      game.library = loadSavedLibrary();
    }
  }

  /* ---------------------------------------------------------
     CATALOG QUERIES
     --------------------------------------------------------- */
  function getCatalog() {
    return MUSIC_CATALOG;
  }

  function getSong(songId) {
    return byId.get(songId) || null;
  }

  function hasSong(songId) {
    return !!game && game.library.indexOf(songId) !== -1;
  }

  function getCash() {
    return game ? game.cash : 0;
  }

  function canAfford(song) {
    return !!game && game.cash >= song.price;
  }

  /* UNOWNED + cash -> PLAY PREVIEW / BUY $5
     UNOWNED, broke -> PLAY PREVIEW / NOT ENOUGH CASH
     OWNED          -> PLAY FULL SONG */
  function getSongUI(songId) {
    const song = getSong(songId);
    if (!song) {
      return null;
    }

    if (hasSong(songId)) {
      return {
        song,
        state: "owned",
        actions: [
          { id: "play_full", label: "PLAY FULL SONG", enabled: !!song.full }
        ]
      };
    }

    const affordable = canAfford(song);
    return {
      song,
      state: affordable ? "can_buy" : "insufficient",
      actions: [
        { id: "play_preview", label: "PLAY PREVIEW", enabled: !!song.preview },
        affordable
          ? { id: "buy", label: "BUY $" + song.price, enabled: true }
          : { id: "buy", label: "NOT ENOUGH CASH", enabled: false }
      ]
    };
  }

  /* In-game currency only. No real-money payments. */
  function buySong(songId) {
    const song = getSong(songId);
    if (!song) {
      return { ok: false, reason: "unknown_song" };
    }
    if (!game) {
      return { ok: false, reason: "not_ready" };
    }
    if (hasSong(songId)) {
      return { ok: false, reason: "already_owned" };
    }
    if (!canAfford(song)) {
      return { ok: false, reason: "not_enough_cash" };
    }

    game.cash -= song.price;
    game.library.push(song.id);
    saveLibrary();

    emit("cq:library-changed", { songId: song.id, cash: game.cash });
    return { ok: true, song };
  }

  /* ---------------------------------------------------------
     LAZY AUDIO
     --------------------------------------------------------- */
  function getPlayer() {
    if (!player) {
      player = new Audio();
      player.preload = "none";

      player.addEventListener("ended", () => {
        const finished = nowPlaying;
        nowPlaying = null;
        emit("cq:music-ended", finished);
      });

      player.addEventListener("error", () => {
        console.warn(
          "CodeQuestER: could not play " +
          (player.dataset.src || "audio")
        );
        const failed = nowPlaying;
        nowPlaying = null;
        emit("cq:music-error", failed);
      });
    }
    return player;
  }

  function stopAll() {
    if (player) {
      player.pause();
    }
    nowPlaying = null;
  }

  /* Call from a click / tap so autoplay rules allow playback. */
  function startPlayback(src, info) {
    const audio = getPlayer();

    stopAll();

    if (audio.dataset.src !== src) {
      audio.src = encodeURI(src);
      audio.dataset.src = src;
    }

    audio.currentTime = 0;
    nowPlaying = info;

    const result = audio.play();

    if (result && typeof result.then === "function") {
      return result.then(
        () => true,
        error => {
          console.warn("CodeQuestER: playback blocked", error);
          /* Only clear our own state. If another song was started
             while this one was pending, leave that one alone. */
          if (nowPlaying === info) {
            nowPlaying = null;
          }
          return false;
        }
      );
    }
    return Promise.resolve(true);
  }

  function playSongPreview(songId) {
    const song = getSong(songId);
    if (!song || !song.preview) {
      return Promise.resolve(false);
    }
    return startPlayback(song.preview, { id: song.id, kind: "preview" });
  }

  function playFullSong(songId) {
    const song = getSong(songId);
    if (!song || !song.full) {
      return Promise.resolve(false);
    }
    if (!FREE_PLAY && !hasSong(songId)) {
      return Promise.resolve(false);
    }
    return startPlayback(song.full, { id: song.id, kind: "full" });
  }

  /* Pause if playing, resume if paused with a song loaded.
     Never starts anything on its own. */
  function toggle() {
    if (!player) {
      return false;
    }

    if (!player.paused) {
      player.pause();
      emit("cq:music-paused", nowPlaying);
      return false;
    }

    if (nowPlaying) {
      const result = player.play();

      if (result && typeof result.then === "function") {
        return result.then(
          () => {
            emit("cq:music-resumed", nowPlaying);
            return true;
          },
          error => {
            console.warn("CodeQuestER: resume blocked", error);
            return false;
          }
        );
      }

      emit("cq:music-resumed", nowPlaying);
      return true;
    }

    return false;
  }

  function getNowPlaying() {
    return nowPlaying;
  }

  function isPlaying() {
    return !!player && !player.paused && !!nowPlaying;
  }

  /* ---------------------------------------------------------
     PUBLIC API
     --------------------------------------------------------- */
  window.CQMusic = {
    catalog: MUSIC_CATALOG,
    START_CASH,
    FREE_PLAY,
    bind,
    getCatalog,
    getSong,
    getSongUI,
    getCash,
    hasSong,
    buySong,
    playSongPreview,
    playFullSong,
    stopAll,
    toggle,
    getNowPlaying,
    isPlaying
  };
})();
