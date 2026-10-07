/* =========================================================
   CODEQUESTER — MUSIC SYSTEM
   Catalog + ownership + lazy audio.
   Plain script (no ES modules). Exposes window.CQMusic.
   Reusable by: Record Store, Radio, Car player, Collection,
   Artist discovery, Music quests.
   AUDIO RULES
   - Nothing is loaded at startup (no Audio elements, no decoding).
   - ONE shared <audio> element is created the first time the
     player presses play, then reused for previews and full songs.
   - Full songs are only played if the player OWNS them.
   OWNERSHIP
   - Lives on the existing GAME object: GAME.library (song ids)
     and GAME.cash. No second player object.
   - Library is saved to localStorage.
   - Cash is NOT saved yet.
   - Cash resets to START_CASH each load until the economy step exists.
   ========================================================= */
(() => {
  "use strict";
  const MUSIC_DIR = "assets/music/";
  const START_CASH = 20;
  const STORAGE_KEY = "codequester.library.v1";
  /* ---------------------------------------------------------
     CATALOG
     Metadata only — never ownership.
     Paths are relative so the game works from a sub-folder
     as well as a site root.
     preview: null means no preview clip exists yet.
     Add one later, for example:
     "assets/music/previews/collectthevibe.mp3"
     artist / city / genre can be null when unknown.
     --------------------------------------------------------- */
  const MUSIC_CATALOG = [
    {
      id: "collect_the_vibe",
      artist: "Lavelle feat The Switchblades",
      title: "Collect The Vibe",
      city: "Detroit",
      genre: "Hip-Hop",
      preview: null,
      full: MUSIC_DIR + "collectthevibe.mp3",
      price: 5
    },
    {
      id: "four_x_four",
      artist: null,
      title: "4 X 4",
      city: null,
      genre: null,
      preview: null,
      full: MUSIC_DIR + "4x4.mp3",
      price: 5
    },
    {
      id: "throwback",
      artist: "AL LUV ft Switchblades",
      title: "Throwback",
      city: null,
      genre: null,
      preview: null,
      full: MUSIC_DIR + "throwback.mp3",
      price: 5
    },
    {
      id: "all_dat_ass",
      artist: null,
      title: "All Dat Ass",
      city: null,
      genre: null,
      preview: null,
      full: MUSIC_DIR + "alldatass.mp3",
      price: 5
    },
    {
      id: "baby_tonight",
      artist: null,
      title: "Baby Tonight",
      city: "Miami",
      genre: null,
      preview: null,
      full: MUSIC_DIR + "babytonight.mp3",
      price: 5
    },
    {
      id: "drive_me",
      artist: null,
      title: "Drive Me",
      city: "Tokyo",
      genre: null,
      preview: null,
      full: MUSIC_DIR + "driveme.mp3",
      price: 5
    },
    {
      id: "dust_on_the_subwoofer",
      artist: null,
      title: "Dust On The Subwoofer",
      city: null,
      genre: null,
      preview: null,
      full: MUSIC_DIR + "dustonthesubwoofer.mp3",
      price: 5
    },
    {
      id: "eighteen_and_a_clutch",
      artist: null,
      title: "Eighteen And A Clutch",
      city: null,
      genre: null,
      preview: null,
      full: MUSIC_DIR + "eighteenandaclutch.mp3",
      price: 5
    },
    {
      id: "mackinthedark_all_i_have",
      artist: "Mackinthedark",
      title: "All I Have In This World",
      city: "Detroit",
      genre: "Hip-Hop",
      preview: null,
      full: MUSIC_DIR + "allihave.mp3",
      price: 5
    },
    {
      id: "gods_favorite",
      artist: null,
      title: "God's Favorite",
      city: "Cozumel",
      genre: null,
      preview: null,
      full: MUSIC_DIR + "godsfavorite.mp3",
      price: 5
    },
    {
      id: "try",
      artist: null,
      title: "TRY",
      city: "Las Vegas",
      genre: null,
      preview: null,
      full: MUSIC_DIR + "try.mp3",
      price: 5
    },
    {
      id: "i_need_you",
      artist: null,
      title: "I Need You",
      city: "Salt Lake City",
      genre: null,
      preview: null,
      full: MUSIC_DIR + "ineedyou.mp3",
      price: 5
    },
    {
      id: "white_smoke",
      artist: null,
      title: "White Smoke",
      city: null,
      genre: null,
      preview: null,
      full: MUSIC_DIR + "whitesmoke.mp3",
      price: 5
    }
  ];
  /* ---------------------------------------------------------
     FAST LOOKUP
     --------------------------------------------------------- */
  const byId = new Map();
  MUSIC_CATALOG.forEach(song => {
    byId.set(song.id, song);
  });
  /* ---------------------------------------------------------
     STATE
     --------------------------------------------------------- */
  let game = null;
  /*
     ONE shared <audio> element.
     It is deliberately created lazily. Nothing is loaded
     until the player actually presses play.
  */
  let player = null;
  /*
     Example:
     {
       id: "collect_the_vibe",
       kind: "full"
     }
     or
     {
       id: "collect_the_vibe",
       kind: "preview"
     }
  */
  let nowPlaying = null;
  /* ---------------------------------------------------------
     EVENTS
     --------------------------------------------------------- */
  function emit(name, detail) {
    try {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail
        })
      );
    } catch (error) {
      /*
         Events are optional.
         Do not allow event errors to break the music system.
      */
    }
  }
  /* ---------------------------------------------------------
     LOAD SAVED LIBRARY
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
      /*
         Drop song IDs that are no longer present in the catalog.
      */
      return data.filter(id => byId.has(id));
    } catch (error) {
      return [];
    }
  }
  /* ---------------------------------------------------------
     SAVE LIBRARY
     --------------------------------------------------------- */
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
      /*
         Private mode / blocked storage.
         Ownership will still exist for this session.
      */
    }
  }
  /* ---------------------------------------------------------
     BIND TO EXISTING GAME STATE
     --------------------------------------------------------- */
  function bind(GAME) {
    game = GAME;
    /*
       Initialize cash if it does not already exist.
    */
    if (typeof game.cash !== "number") {
      game.cash = START_CASH;
    }
    /*
       Initialize the music library if the main game has
       not created one yet.
    */
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
    return !!game &&
      game.cash >= song.price;
  }
  /* ---------------------------------------------------------
     SONG UI STATE
     
     UNOWNED + enough cash
       -> PLAY PREVIEW
       -> BUY $5
     UNOWNED + not enough cash
       -> PLAY PREVIEW
       -> NOT ENOUGH CASH
     OWNED
       -> PLAY FULL SONG
     --------------------------------------------------------- */
  function getSongUI(songId) {
    const song = getSong(songId);
    if (!song) {
      return null;
    }
    /*
       Already owned.
    */
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
    /*
       Not owned.
    */
    const affordable = canAfford(song);
    return {
      song,
      state: affordable
        ? "can_buy"
        : "insufficient",
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
     BUY SONG
     
     This uses in-game currency only.
     There are NO real-money payments here.
     --------------------------------------------------------- */
  function buySong(songId) {
    const song = getSong(songId);
    if (!song) {
      return {
        ok: false,
        reason: "unknown_song"
      };
    }
    if (!game) {
      return {
        ok: false,
        reason: "not_ready"
      };
    }
    if (hasSong(songId)) {
      return {
        ok: false,
        reason: "already_owned"
      };
    }
    if (!canAfford(song)) {
      return {
        ok: false,
        reason: "not_enough_cash"
      };
    }
    /*
       Take the money.
    */
    game.cash -= song.price;
    /*
       Add song to ownership library.
    */
    game.library.push(song.id);
    /*
       Persist ownership.
    */
    saveLibrary();
    /*
       Notify the rest of CodeQuestER.
    */
    emit(
      "cq:library-changed",
      {
        songId: song.id,
        cash: game.cash
      }
    );
    return {
      ok: true,
      song
    };
  }
  /* ---------------------------------------------------------
     AUDIO
     
     LAZY AUDIO SYSTEM
     No Audio object exists until something actually
     attempts to play.
     Once created, the same Audio object is reused.
     --------------------------------------------------------- */
  function getPlayer() {
    if (!player) {
      player = new Audio();
      /*
         Do not preload music.
      */
      player.preload = "none";
      /*
         Song ended.
      */
      player.addEventListener(
        "ended",
        () => {
          const finished = nowPlaying;
          nowPlaying = null;
          emit(
            "cq:music-ended",
            finished
          );
        }
      );
      /*
         Playback error.
      */
      player.addEventListener(
        "error",
        () => {
          console.warn(
            "CodeQuestER: could not play " +
            (player.dataset.src || "audio")
          );
          nowPlaying = null;
        }
      );
    }
    return player;
  }
  /* ---------------------------------------------------------
     STOP CURRENT AUDIO
     --------------------------------------------------------- */
  function stopAll() {
    if (player) {
      player.pause();
    }
    nowPlaying = null;
  }
  /* ---------------------------------------------------------
     START PLAYBACK
     
     IMPORTANT:
     This should be called from a click/tap so browser
     autoplay rules allow playback.
     --------------------------------------------------------- */
  function startPlayback(src, info) {
    const audio = getPlayer();
    /*
       Stop whatever is currently playing.
    */
    stopAll();
    /*
       Only replace the source when it changes.
    */
    if (audio.dataset.src !== src) {
      audio.src = encodeURI(src);
      audio.dataset.src = src;
    }
    /*
       Always start the requested song from the beginning.
    */
    audio.currentTime = 0;
    /*
       Track what's playing.
    */
    nowPlaying = info;
    /*
       Start audio.
    */
    const result = audio.play();
    /*
       Modern browsers return a Promise from play().
    */
    if (
      result &&
      typeof result.then === "function"
    ) {
      return result.then(
        () => true,
        error => {
          console.warn(
            "CodeQuestER: playback blocked",
            error
          );
          nowPlaying = null;
          return false;
        }
      );
    }
    return Promise.resolve(true);
  }
  /* ---------------------------------------------------------
     PLAY PREVIEW
     --------------------------------------------------------- */
  function playSongPreview(songId) {
    const song = getSong(songId);
    if (!song || !song.preview) {
      return Promise.resolve(false);
    }
    return startPlayback(
      song.preview,
      {
        id: song.id,
        kind: "preview"
      }
    );
  }
  /* ---------------------------------------------------------
     PLAY FULL SONG
     
     Full songs require ownership.
     --------------------------------------------------------- */
  function playFullSong(songId) {
    const song = getSong(songId);
    /*
       Cannot play a missing song.
    */
    if (!song || !song.full) {
      return Promise.resolve(false);
    }
    /*
       Cannot play full song without owning it.
    */
    if (!hasSong(songId)) {
      return Promise.resolve(false);
    }
    return startPlayback(
      song.full,
      {
        id: song.id,
        kind: "full"
      }
    );
  }
  /* ---------------------------------------------------------
     CURRENTLY PLAYING
     --------------------------------------------------------- */
  function getNowPlaying() {
    return nowPlaying;
  }
  /* ---------------------------------------------------------
     EXPOSE PUBLIC API
     --------------------------------------------------------- */
  window.CQMusic = {
    /*
       Catalog
    */
    catalog: MUSIC_CATALOG,
    /*
       Economy
    */
    START_CASH,
    /*
       Game binding
    */
    bind,
    /*
       Catalog queries
    */
    getCatalog,
    getSong,
    getSongUI,
    /*
       Player economy / ownership
    */
    getCash,
    hasSong,
    buySong,
    /*
       Audio
    */
    playSongPreview,
    playFullSong,
    stopAll,
     /* ---------------------------------------------------------
   RADIO TOGGLE
   If music is playing, pause it.
   If a song is currently selected, resume it.
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
    const result = player.play();

    if (
      result &&
      typeof result.then === "function"
    ) {
      return result.then(
        () => {
          emit("cq:music-resumed", nowPlaying);
          return true;
        },
        error => {
          console.warn(
            "CodeQuestER: resume blocked",
            error
          );
          return false;
        }
      );
    }

    emit("cq:music-resumed", nowPlaying);
    return true;
  }

  return false;
}
    getNowPlaying
  };
})();

The catalog now contains these 13 tracks:

1. Collect The Vibe
2. 4 X 4
3. Throwback
4. All Dat Ass
5. Baby Tonight
6. Drive Me
7. Dust On The Subwoofer
8. Eighteen And A Clutch
9. All I Have In This World
10. God’s Favorite
11. TRY
12. I Need You
13. White Smoke

And the four new files are referenced exactly as:

assets/music/godsfavorite.mp3
assets/music/try.mp3
assets/music/ineedyou.mp3
assets/music/whitesmoke.mp3

I also kept God’s Favorite → Cozumel, TRY → Las Vegas, and I Need You → Salt Lake City from your CodeQuestER city/music mapping.
