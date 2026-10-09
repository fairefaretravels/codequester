/* =========================================================
   CODEQUESTER — DRIVER CONTROLS
   Plain script (no ES modules).
   Load order: music.js, main.js, drivercontrols.js, tapedeck.js

   1) STEERING WHEEL
      Drag the wheel clockwise to turn right, counter-clockwise
      to turn left. It springs back to centre when released.
      Feeds GAME.analogSteer (-1..1); main.js reads it in
      updateSteering(). Keyboard still works when the wheel is idle.
      Replaces the LEFT / RIGHT buttons on touch screens.

   2) RADIO KEYS
      M = play / pause, N = next track. The player itself is the
      tape deck (tapedeck.js), reached through window.CQTapeDeck.

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

  /* "auto"   = wheel on touch screens, buttons on desktop
     "always" = wheel everywhere
     "never"  = old buttons only */
  const WHEEL_MODE = "auto";
  const WHEEL_SIZE = 140;
  const MAX_TURN = (125 * Math.PI) / 180;

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
  function buildWheel() {
    const host = GAME.ui.steerButtons;
    const row = GAME.ui.mobile;
    if (!host || !row) {
      return;
    }

    host.innerHTML = "";
    row.style.alignItems = "flex-end";

    const wheel = document.createElement("div");
    wheel.style.cssText =
      "width:" + WHEEL_SIZE + "px;height:" + WHEEL_SIZE + "px;" +
      "border-radius:50%;background:rgba(0,0,0,.35);" +
      "touch-action:none;pointer-events:auto;" +
      "user-select:none;-webkit-user-select:none;";
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

    /* tapedeck.js reads this to sit above the wheel */
    GAME.ui.wheelOn = true;
    GAME.ui.wheelSize = WHEEL_SIZE;
  }

  if (
    WHEEL_MODE === "always" ||
    (WHEEL_MODE === "auto" && isTouch())
  ) {
    buildWheel();
  }

  /* =======================================================
     MUSIC BINDING + RADIO KEYS
     ======================================================= */
  if (window.CQMusic) {
    try {
      window.CQMusic.bind(GAME);
    } catch (error) {
      console.warn("CodeQuestER: could not bind music", error);
    }
  } else {
    console.warn("CodeQuestER: CQMusic not found, music disabled");
  }

  window.addEventListener("keydown", event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (!window.CQTapeDeck) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "m") {
      window.CQTapeDeck.toggle();
    } else if (key === "n") {
      window.CQTapeDeck.next();
    }
  });
})();
