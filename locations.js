/* =========================================================
   CODEQUESTER — LANDMARKS + INTERACTION
   Plain script (no ES modules).
   Exposes: window.CQLocations, window.CQHooks, window.openRecordStore

   - Landmarks are DATA (id, type, name, interactRadius).
     They are resolved onto existing buildings from the
     track generator (track.destinations).
   - Interaction: when the car is inside a landmark's
     interactRadius, a tap button appears (and Enter works).
   - openRecordStore() is a STUB for now.

   CQHooks is a tiny per-frame registry so main.js needs only
   ONE line in its loop:  CQHooks.frame(delta, car.position)
   A hook that throws is removed instead of breaking driving.
   ========================================================= */
(() => {
  "use strict";

  /* =======================================================
     PER-FRAME HOOKS
     ======================================================= */
  if (!window.CQHooks) {
    const hooks = [];

    window.CQHooks = {
      register(fn) {
        if (typeof fn === "function") {
          hooks.push(fn);
        }
      },

      frame(delta, carPosition) {
        for (let i = 0; i < hooks.length; i++) {
          try {
            hooks[i](delta, carPosition);
          } catch (error) {
            console.warn(
              "CodeQuestER: frame hook removed after error",
              error
            );
            hooks.splice(i, 1);
            i--;
          }
        }
      }
    };
  }

  /* =======================================================
     LANDMARK DATA
     buildingType picks the existing destination building.
     interactRadius is measured from the building footprint
     edge (same way the discovery system measures).
     ======================================================= */
  const LANDMARK_DEFS = [
    {
      id: "record_store",
      type: "music_store",
      name: "RECORD STORE",
      buildingType: "record_store",
      interactRadius: 8,
      prompt: "ENTER RECORD STORE",
      onInteract: () => openRecordStore()
    }
  ];

  const landmarks = new Map();

  /* =======================================================
     REGISTER / RESOLVE
     register() also lets other systems add landmarks later
     (the city visuals add the movie theatre this way).
     ======================================================= */
  function register(definition) {
    if (!definition || !definition.id || !definition.position) {
      return null;
    }

    const landmark = {
      id: definition.id,
      type: definition.type || "landmark",
      name: definition.name || definition.id,
      position: definition.position,
      halfWidth: definition.halfWidth || 0,
      halfDepth: definition.halfDepth || 0,
      interactRadius: definition.interactRadius || 0,
      prompt: definition.prompt || "ENTER",
      onInteract: definition.onInteract || null,
      building: definition.building || null
    };

    landmarks.set(landmark.id, landmark);
    return landmark;
  }

  function init(track) {
    LANDMARK_DEFS.forEach(definition => {
      const building = (track.destinations || []).find(
        candidate =>
          candidate.userData &&
          candidate.userData.buildingType === definition.buildingType
      );

      if (
        !building ||
        !building.geometry ||
        !building.geometry.parameters
      ) {
        console.warn(
          "CodeQuestER: no building for landmark " + definition.id
        );
        return;
      }

      const size = building.geometry.parameters;

      register({
        id: definition.id,
        type: definition.type,
        name: definition.name,
        position: {
          x: building.position.x,
          y: 0,
          z: building.position.z
        },
        halfWidth: size.width / 2,
        halfDepth: size.depth / 2,
        interactRadius: definition.interactRadius,
        prompt: definition.prompt,
        onInteract: definition.onInteract,
        building
      });
    });
  }

  function get(id) {
    return landmarks.get(id) || null;
  }

  /* distance from a point to the building footprint edge */
  function distanceTo(landmark, point) {
    const dx = Math.max(
      Math.abs(point.x - landmark.position.x) - landmark.halfWidth,
      0
    );
    const dz = Math.max(
      Math.abs(point.z - landmark.position.z) - landmark.halfDepth,
      0
    );
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* =======================================================
     OPEN RECORD STORE  (stub)
     The store screen will be built on top of CQMusic.
     ======================================================= */
  let toast = null;
  let toastTimer = null;

  function showToast(head, body) {
    if (!toast) {
      toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);" +
        "z-index:32;font-family:Arial,sans-serif;color:#fff;text-align:center;" +
        "background:rgba(0,0,0,.78);border:1px solid rgba(255,43,214,.7);" +
        "border-radius:10px;padding:12px 18px;pointer-events:none;" +
        "text-shadow:0 0 10px #ff2bd6;opacity:0;transition:opacity .25s;";
      document.body.appendChild(toast);
    }

    toast.innerHTML =
      '<div style="font-size:13px;letter-spacing:2px;color:#ff2bd6">' +
      head +
      '</div><div style="font-size:16px;font-weight:bold;margin-top:4px">' +
      body +
      "</div>";
    toast.style.opacity = "1";

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
    }, 2600);
  }

  function openRecordStore() {
    const count =
      window.CQMusic && CQMusic.getCatalog
        ? CQMusic.getCatalog().length
        : 0;
    const cash = window.CQMusic ? CQMusic.getCash() : 0;

    showToast(
      "RECORD STORE",
      count + " songs in the catalog — $" + cash + " cash"
    );

    try {
      window.dispatchEvent(new CustomEvent("cq:open-record-store"));
    } catch (error) {
      /* optional */
    }

    return { catalogSize: count, cash };
  }

  function interact(id) {
    const landmark = landmarks.get(id);
    if (landmark && typeof landmark.onInteract === "function") {
      return landmark.onInteract(landmark);
    }
    return null;
  }

  /* =======================================================
     INTERACTION PROMPT (tap button + Enter key)
     Cheap: a handful of distance checks per frame, and the
     DOM is only touched when the active landmark changes.
     ======================================================= */
  let active = null;
  let button = null;

  function ensureButton() {
    if (button) {
      return;
    }

    button = document.createElement("button");
    button.type = "button";
    button.style.cssText =
      "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);" +
      "z-index:27;display:none;padding:12px 20px;border-radius:12px;" +
      "border:1px solid #ff2bd6;background:rgba(0,0,0,.8);color:#fff;" +
      "font:bold 15px Arial,sans-serif;touch-action:manipulation;" +
      "text-shadow:0 0 8px #ff2bd6;";

    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      if (active) {
        interact(active.id);
      }
    });

    document.body.appendChild(button);

    window.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.repeat && active) {
        event.preventDefault();
        interact(active.id);
      }
    });
  }

  function update(delta, carPosition) {
    ensureButton();

    let nearest = null;

    landmarks.forEach(landmark => {
      if (!landmark.interactRadius) {
        return;
      }
      if (distanceTo(landmark, carPosition) <= landmark.interactRadius) {
        nearest = landmark;
      }
    });

    if (nearest !== active) {
      active = nearest;

      if (active) {
        button.textContent = active.prompt + "  [ENTER]";
        button.style.display = "block";
      } else {
        button.style.display = "none";
      }
    }
  }

  window.CQHooks.register(update);

  /* =======================================================
     EXPOSE
     ======================================================= */
  window.CQLocations = {
    init,
    register,
    get,
    interact,
    distanceTo,
    openRecordStore
  };

  window.openRecordStore = openRecordStore;
})();
