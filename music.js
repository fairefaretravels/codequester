
/* =========================================================
   CODEQUESTER — MUSIC SYSTEM
   Catalog + ownership + live radio + lazy audio.
   Plain script (no ES modules). Exposes window.CQMusic.

   LOAD BEFORE:
     drivercontrols.js
     tapedeck.js

   FEATURES
   - 13-song music catalog
   - Free play enabled
   - Shared audio player for songs and live radio
   - MACKINTHEDARK Radio live-stream support
   - In-game cash and song ownership
   - Saved song library
   - Playback, pause, resume, stop, and error events

   LIVE RADIO
   - Uses the configured stream URL below.
   - Playback must be triggered by a user click or tap.
   - The tape deck must call CQMusic.playLiveRadio().

   AUDIO
   - Nothing loads at startup.
   - One shared audio element is reused.
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     SETTINGS
     --------------------------------------------------------- */

  const FREE_PLAY = true;
  const MUSIC_DIR = "assets/music/";
  const START_CASH = 20;
  const STORAGE_KEY = "codequester.library.v1";

  const LIVE_RADIO = {
  id: "mackinthedark_radio",
  title: "MACKINTHEDARK Radio",
  url: "https://listen.streamaudio.co/proxy/mackinthedark/stream"
};

  /* ---------------------------------------------------------
     SONG CATALOG
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

    entry("drive_me", "Drive Me", "driveme.mp3", {
      city: "Tokyo"
    }),

    entry(
      "dust_on_the_subwoofer",
      "Dust On The Subwoofer",
      "dustonthesubwoofer.mp3"
    ),

    entry(
      "eighteen_and_a_clutch",
      "Eighteen And A Clutch",
      "eighteenandaclutch.mp3"
    ),

    entry(
      "mackinthedark_all_i_have",
      "All I Have In This World",
      "allihave.mp3",
      {
        artist: "Mackinthedark",
        city: "Detroit",
        genre: "Hip-Hop"
      }
    ),

    entry("gods_favorite", "God's Favorite", "godsfavorite.mp3", {
      city: "Cozumel"
    }),

    entry("try", "TRY", "try.mp3", {
      city: "Las Vegas"
    }),

    entry("i_need_you", "I Need You", "ineedyou.mp3", {
      city: "Salt Lake City"
    }),

    entry("white_smoke", "White Smoke", "whitesmoke.mp3")
  ];

  const byId = new Map();

  MUSIC_CATALOG.forEach(song => {
    byId.set(song.id, song);
  });

  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */

  let game = null;
  let player = null;
  let nowPlaying = null;

  function emit(name, detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, { detail })
      );
    } catch (error) {
      // Event dispatch is optional.
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
      // Library remains available during this session.
    }
  }

  function bind(GAME) {
    if (!GAME) {
      return;
    }

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
    return !!game &&
      game.library.indexOf(songId) !== -1;
  }

  function getCash() {
    return game ? game.cash : 0;
  }

  function canAfford(song) {
    return !!game && game.cash >= song.price;
  }

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
          {
            id: "play_full",
            label: "PLAY FULL SONG",
            enabled: !!song.full
          }
        ]
      };
    }

    const affordable = canAfford(song);

    return {
      song,
      state: affordable ? "can_buy" : "insufficient",
      actions: [
        {
          id: "play_preview",
          label: "PLAY PREVIEW",
          enabled: !!song.preview
        },
        affordable
          ? {
              id: "buy",
              label: "BUY $" + song.price,
              enabled: true
            }
          : {
              id: "buy",
              label: "NOT ENOUGH CASH",
              enabled: false
            }
      ]
    };
  }

  /* ---------------------------------------------------------
     IN-GAME SONG PURCHASES
     --------------------------------------------------------- */

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

    emit("cq:library-changed", {
      songId: song.id,
      cash: game.cash
    });

    return { ok: true, song };
  }

  /* ---------------------------------------------------------
     SHARED AUDIO PLAYER
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
        const failed = nowPlaying;

        console.error(
          "CodeQuestER: audio failed.",
          {
            item: failed,
            source: player.currentSrc || player.src,
            mediaError: player.error
              ? player.error.code
              : null
          }
        );

        nowPlaying = null;

        emit("cq:music-error", {
          ...(failed || {}),
          source: player.currentSrc || player.src,
          errorCode: player.error
            ? player.error.code
            : null
        });
      });

      player.addEventListener("playing", () => {
        emit("cq:music-playing", nowPlaying);
      });

      player.addEventListener("waiting", () => {
        emit("cq:music-buffering", nowPlaying);
      });
    }

    return player;
  }

  /* ---------------------------------------------------------
     STOP PLAYBACK
     --------------------------------------------------------- */

  function stopAll() {
    if (player) {
      player.pause();
    }

    nowPlaying = null;

    emit("cq:music-stopped", null);
  }

  /* ---------------------------------------------------------
     START AUDIO
     Called by a user action such as tapping PLAY.
     --------------------------------------------------------- */

  function startPlayback(src, info) {
    if (!src || typeof src !== "string") {
      return Promise.resolve(false);
    }

    const audio = getPlayer();

    // Stop previous audio without creating another player.
    audio.pause();
    nowPlaying = null;

    if (audio.dataset.src !== src) {
      audio.src = src;
      audio.dataset.src = src;
    }

    try {
      audio.currentTime = 0;
    } catch (error) {
      // Live streams may not support seeking.
    }

    nowPlaying = info;

    emit("cq:music-loading", info);

    let result;

    try {
      result = audio.play();
    } catch (error) {
      console.error("CodeQuestER: playback failed.", error);

      if (nowPlaying === info) {
        nowPlaying = null;
      }

      emit("cq:music-error", {
        ...info,
        message: error.message
      });

      return Promise.resolve(false);
    }

    if (result && typeof result.then === "function") {
      return result.then(
        () => true,
        error => {
          console.error(
            "CodeQuestER: playback could not start.",
            error
          );

          if (nowPlaying === info) {
            nowPlaying = null;
          }

          emit("cq:music-error", {
            ...info,
            message: error.message
          });

          return false;
        }
      );
    }

    return Promise.resolve(true);
  }

  /* ---------------------------------------------------------
     SONG PLAYBACK
     --------------------------------------------------------- */

  function playSongPreview(songId) {
    const song = getSong(songId);

    if (!song || !song.preview) {
      return Promise.resolve(false);
    }

    return startPlayback(song.preview, {
      id: song.id,
      title: song.title,
      kind: "preview"
    });
  }

  function playFullSong(songId) {
    const song = getSong(songId);

    if (!song || !song.full) {
      return Promise.resolve(false);
    }

    if (!FREE_PLAY && !hasSong(songId)) {
      return Promise.resolve(false);
    }

    return startPlayback(song.full, {
      id: song.id,
      title: song.title,
      kind: "full"
    });
  }

  /* ---------------------------------------------------------
     MACKINTHEDARK RADIO
     Separate from the song catalog and ownership system.
     --------------------------------------------------------- */

  function playLiveRadio() {
    if (!LIVE_RADIO.url) {
      console.error(
        "CodeQuestER: configure the live radio URL first."
      );

      return Promise.resolve(false);
    }

    return startPlayback(LIVE_RADIO.url, {
      id: LIVE_RADIO.id,
      title: LIVE_RADIO.title,
      kind: "live"
    });
  }

  /* ---------------------------------------------------------
     PAUSE / RESUME
     --------------------------------------------------------- */

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
      const current = nowPlaying;
      let result;

      try {
        result = player.play();
      } catch (error) {
        console.error("CodeQuestER: resume failed.", error);
        return Promise.resolve(false);
      }

      if (result && typeof result.then === "function") {
        return result.then(
          () => {
            emit("cq:music-resumed", current);
            return true;
          },
          error => {
            console.error("CodeQuestER: resume blocked.", error);
            return false;
          }
        );
      }

      emit("cq:music-resumed", current);

      return true;
    }

    return false;
  }

  /* ---------------------------------------------------------
     PLAYBACK STATUS
     --------------------------------------------------------- */

  function getNowPlaying() {
    return nowPlaying;
  }

  function isPlaying() {
    return !!player &&
      !player.paused &&
      !!nowPlaying;
  }

  function getLiveRadio() {
    return LIVE_RADIO;
  }

  /* ---------------------------------------------------------
     PUBLIC API
     --------------------------------------------------------- */

  window.CQMusic = {
    catalog: MUSIC_CATALOG,
    START_CASH,
    FREE_PLAY,
    LIVE_RADIO,

    bind,

    getCatalog,
    getSong,
    getSongUI,
    getCash,
    hasSong,
    buySong,

    playSongPreview,
    playFullSong,
    playLiveRadio,

    getLiveRadio,
    stopAll,
    toggle,
    getNowPlaying,
    isPlaying
  };

})();
