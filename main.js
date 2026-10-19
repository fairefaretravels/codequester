/* =========================================================
   CODEQUESTER — MAIN GAME
   Three.js r156 — FREE DRIVING BUILD

   LOAD ORDER (index.html):
     three, trackgenerator.js, music.js, locations.js,
     cityvisuals.js, main.js, drivercontrols.js, tapedeck.js

   CONTROLS
   W / Up     Accelerate        A / Left   Steer left
   S / Down   Brake / Reverse   D / Right  Steer right
   C          Toggle DRIVE / LOOK camera
   Q E R F    Look around (LOOK mode)
   T          Flip steering direction
   M / N      Radio play-pause / next (drivercontrols.js)

   NOTES
   - Free driving: nothing pulls the car back to the road.
   - Physics is scaled by frame time (same speed at 60/120Hz).
   - City visuals: CQCityVisuals.apply(track) runs once after
     the track is generated; CQCityVisuals.update() runs every
     frame. Both are guarded, so the game still runs if
     cityvisuals.js fails to load.
   ========================================================= */
(() => {
  "use strict";

  /* STEERING DIRECTION (saved in this browser) */
  const STEER_KEY = "codequester.steerSign.v1";
  let steerSign = -1;

  try {
    const saved = window.localStorage.getItem(STEER_KEY);
    if (saved === "1" || saved === "-1") {
      steerSign = Number(saved);
    }
  } catch (error) {
    /* storage blocked: toggle still works for this session */
  }

  /* =========================================================
     GAME STATE
     ========================================================= */
  const GAME = {
    speed: 0,
    maxSpeed: 0.72,
reverseSpeed: 0.16,
acceleration: 0.0035,
braking: 0.012,
friction: 0.006,
    steering: 0,
    steeringTarget: 0,
    steeringPower: 0.032,
    distance: 0,
    lap: 1,
    score: 0,
    trackIndex: 0,
    lastTrackIndex: 0,
    boostTimer: 0,
    boostPower: 1,
    airborne: false,
    jumpVelocity: 0,
    keys: {
      forward: false,
      backward: false,
      left: false,
      right: false
    }
  };

  function releaseDrivingKeys() {
    GAME.keys.forward = false;
    GAME.keys.backward = false;
    GAME.keys.left = false;
    GAME.keys.right = false;
  }

  /* =========================================================
     SCENE, CAMERA, RENDERER
     ========================================================= */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02050b);
  scene.fog = new THREE.Fog(0x02050b, 70, 260);

  const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 6, 10);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  /* =========================================================
     LIGHTING
     The sun (and its shadow box) follows the car.
     ========================================================= */
  scene.add(new THREE.HemisphereLight(0x8fd8ff, 0x05070b, 1.7));

  const SUN_OFFSET = new THREE.Vector3(-60, 90, 40);
  const SUN_SNAP = 20;

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(sun.target);

  function updateSun() {
    const x = Math.round(car.position.x / SUN_SNAP) * SUN_SNAP;
    const z = Math.round(car.position.z / SUN_SNAP) * SUN_SNAP;
    sun.target.position.set(x, 0, z);
    sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
    sun.target.updateMatrixWorld();
  }

  /* =========================================================
     TRACK GENERATOR
     ========================================================= */
  const track = new TrackGenerator(scene);
  const waypoints = track.generate();

  if (!waypoints || waypoints.length < 10) {
    console.error("CodeQuestER: Track generation failed.");
    return;
  }

  const TRACK_COUNT = waypoints.length;
  const ROAD_WIDTH = track.laneHalfWidth * 2;

  /* =========================================================
     CITY VISUALS (one-time post-pass)
     Images, skybox, backdrop, billboards, record store, theatre.
     ========================================================= */
  if (window.CQCityVisuals) {
    try {
      window.CQCityVisuals.apply(track);
    } catch (error) {
      console.error("CodeQuestER: city visuals failed:", error);
    }
  } else {
    console.warn("CodeQuestER: cityvisuals.js not loaded.");
  }

  /* =========================================================
     PLAYER CAR
     ========================================================= */
  const car = new THREE.Group();
  car.name = "CodeQuestER_Player";
  scene.add(car);

  const BODY_BASE_COLOR = 0x168cff;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: BODY_BASE_COLOR,
    metalness: 0.65,
    roughness: 0.25
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.25, 0.62, 4.15),
    bodyMaterial
  );
  body.position.y = 0.65;
  body.castShadow = true;
  car.add(body);

  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.22, 1.15),
    bodyMaterial
  );
  hood.position.set(0, 0.96, -1.42);
  hood.castShadow = true;
  car.add(hood);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.58, 1.9),
    new THREE.MeshStandardMaterial({
      color: 0x092c58,
      metalness: 0.35,
      roughness: 0.2,
      transparent: true,
      opacity: 0.88
    })
  );
  cabin.position.set(0, 1.13, 0.05);
  cabin.castShadow = true;
  car.add(cabin);

  /* wheels */
  const wheels = [];
  const frontWheels = [];
  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.32, 18);
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x080808,
    roughness: 0.8,
    metalness: 0.1
  });

  function createWheel(x, z, front) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.42, z);
    wheel.castShadow = true;
    car.add(wheel);
    wheels.push(wheel);
    if (front) {
      frontWheels.push(wheel);
    }
  }

  createWheel(-1.08, -1.35, true);
  createWheel(1.08, -1.35, true);
  createWheel(-1.08, 1.35, false);
  createWheel(1.08, 1.35, false);

  /* headlights */
  const headlightGeometry = new THREE.BoxGeometry(0.4, 0.18, 0.08);
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffd0 });

  function createHeadlight(x) {
    const light = new THREE.Mesh(headlightGeometry, headlightMaterial);
    light.position.set(x, 0.73, -2.1);
    car.add(light);

    const spot = new THREE.SpotLight(0xffffff, 2.0, 35, Math.PI / 7, 0.5, 1);
    spot.position.set(x, 0.85, -2);
    spot.target.position.set(x, 0, -15);
    car.add(spot);
    car.add(spot.target);
  }

  createHeadlight(-0.65);
  createHeadlight(0.65);

  /* rear lights */
  const rearLightGeometry = new THREE.BoxGeometry(0.42, 0.18, 0.08);
  const rearLightMaterial = new THREE.MeshBasicMaterial({ color: 0xff1744 });

  function createRearLight(x) {
    const light = new THREE.Mesh(rearLightGeometry, rearLightMaterial);
    light.position.set(x, 0.72, 2.08);
    car.add(light);
  }

  createRearLight(-0.65);
  createRearLight(0.65);

  /* start position: the car drives toward local -Z */
  function getDirection(index) {
    const current = waypoints[index % TRACK_COUNT];
    const next = waypoints[(index + 1) % TRACK_COUNT];
    return new THREE.Vector3().subVectors(next, current).normalize();
  }

  const startDirection = getDirection(0);
  car.position.copy(waypoints[0]);
  car.position.y = 0;
  car.rotation.y = Math.atan2(-startDirection.x, -startDirection.z);

  updateSun();

  /* =========================================================
     HUD
     ========================================================= */
  /* Desktop: full info panel (unchanged).
     Mobile (600px or narrower): one compact SPEED / LAP row with a
     + button that reveals score, boost, track, discoveries, quest
     and the keyboard list. */
  const HUD_MOBILE_QUERY = window.matchMedia
    ? window.matchMedia("(max-width: 600px)")
    : null;

  function hudIsMobile() {
    return HUD_MOBILE_QUERY
      ? HUD_MOBILE_QUERY.matches
      : window.innerWidth <= 600;
  }

  const HUD_DESKTOP_CSS =
    "position:fixed;top:14px;left:14px;z-index:20;" +
    "font-family:Arial,sans-serif;color:#fff;background:rgba(0,0,0,.72);" +
    "border:1px solid rgba(0,234,255,.4);padding:12px 16px;" +
    "border-radius:8px;min-width:190px;line-height:1.45;";

  const HUD_MOBILE_CSS =
    "position:fixed;top:14px;left:10px;z-index:20;box-sizing:border-box;" +
    "max-width:calc(100vw - 140px);font-family:Arial,sans-serif;" +
    "font-size:12px;line-height:1.35;color:#fff;" +
    "background:rgba(0,0,0,.72);border:1px solid rgba(0,234,255,.4);" +
    "padding:5px 6px 5px 9px;border-radius:8px;" +
    "display:flex;flex-wrap:wrap;align-items:center;gap:6px;";

  const hud = document.createElement("div");
  hud.id = "cq-hud";
  document.body.appendChild(hud);

  const hudMain = document.createElement("div");
  hudMain.style.cssText = "flex:1 1 auto;white-space:nowrap;";

  const hudToggle = document.createElement("button");
  hudToggle.type = "button";
  hudToggle.setAttribute("aria-label", "Show or hide HUD details");
  hudToggle.style.cssText =
    "display:none;width:26px;height:26px;padding:0;border-radius:7px;" +
    "border:1px solid rgba(0,234,255,.6);background:rgba(0,0,0,.72);" +
    "color:#fff;font:bold 16px/1 Arial,sans-serif;cursor:pointer;" +
    "touch-action:manipulation;";

  const hudDetails = document.createElement("div");
  hudDetails.style.cssText =
    "display:none;flex:1 1 100%;font-size:11px;line-height:1.4;" +
    "max-height:50vh;overflow-y:auto;";

  hud.appendChild(hudMain);
  hud.appendChild(hudToggle);
  hud.appendChild(hudDetails);

  let hudOpen = false;
  let hudMobile = hudIsMobile();

  const message = document.createElement("div");
  message.style.cssText =
    "position:fixed;left:50%;top:18%;transform:translate(-50%,-50%);" +
    "z-index:30;color:#fff;font-family:Arial,sans-serif;font-size:26px;" +
    "font-weight:bold;text-align:center;text-shadow:0 0 12px #00eaff;" +
    "pointer-events:none;opacity:0;";
  document.body.appendChild(message);

  let messageTimer = 0;

  function showMessage(text) {
    message.textContent = text;
    message.style.opacity = "1";
    messageTimer = 1.8;
  }

  function updateMessage(delta) {
    if (messageTimer > 0) {
      messageTimer -= delta;
      if (messageTimer <= 0) {
        message.style.opacity = "0";
      }
    }
  }

  let hudMainHTML = "";
  let hudDetailsHTML = "";

  const HUD_KEYS_HTML =
    "W / \u2191  ACCELERATE<br>" +
    "S / \u2193  BRAKE<br>" +
    "A / \u2190  LEFT<br>" +
    "D / \u2192  RIGHT<br>" +
    "C  CAMERA VIEW<br>" +
    "Q E R F  LOOK<br>" +
    "M  RADIO   N  NEXT";

  function hudStatsHTML() {
    const boost = GAME.boostTimer > 0 ? "ACTIVE" : "READY";

    return (
      "SCORE: " + GAME.score + "<br>" +
      "BOOST: " + boost + "<br>" +
      "TRACK: " + (GAME.trackIndex + 1) + "/" + TRACK_COUNT + "<br>" +
      "DISCOVERED: " + discoveredCount() + " / " + LOCATIONS.length + "<br>" +
      "QUEST: " + questHudText()
    );
  }

  function syncHudToggle() {
    hudToggle.textContent = hudOpen ? "\u2212" : "+";
    hudToggle.setAttribute("aria-expanded", hudOpen ? "true" : "false");
    /* an open details list sits above the combat stack */
    hud.style.zIndex = hudMobile && hudOpen ? "36" : "20";
  }

  function applyHudLayout() {
    hudMobile = hudIsMobile();
    hudMainHTML = "";
    hudDetailsHTML = "";
    hud.style.cssText = hudMobile ? HUD_MOBILE_CSS : HUD_DESKTOP_CSS;
    hudToggle.style.display = hudMobile ? "block" : "none";
    hudDetails.style.display = "none";
    syncHudToggle();
  }

  /* Only touches the DOM when the text actually changes. */
  function updateHUD() {
    const mph = Math.round(Math.abs(GAME.speed) * 145);

    let mainHTML;
    let detailsHTML = "";

    if (hudMobile) {
      mainHTML =
        "<strong>SPD " + mph + "</strong>&nbsp;&nbsp;" +
        "<strong>LAP " + GAME.lap + "</strong>";
      if (hudOpen) {
        detailsHTML = hudStatsHTML() + "<br><br>" + HUD_KEYS_HTML;
      }
    } else {
      mainHTML =
        "<strong>CODEQUESTER</strong><br>" +
        "SPEED: " + mph + "<br>" +
        "LAP: " + GAME.lap + "<br>" +
        hudStatsHTML() + "<br><br>" +
        HUD_KEYS_HTML;
    }

    if (mainHTML !== hudMainHTML) {
      hudMainHTML = mainHTML;
      hudMain.innerHTML = mainHTML;
    }

    if (detailsHTML !== hudDetailsHTML) {
      hudDetailsHTML = detailsHTML;
      hudDetails.innerHTML = detailsHTML;
      hudDetails.style.display = detailsHTML ? "block" : "none";
    }
  }

  hudToggle.addEventListener("click", () => {
    hudOpen = !hudOpen;
    syncHudToggle();
    updateHUD();
    hudToggle.blur();
  });

  if (HUD_MOBILE_QUERY) {
    const onHudQueryChange = () => {
      applyHudLayout();
      updateHUD();
    };
    if (HUD_MOBILE_QUERY.addEventListener) {
      HUD_MOBILE_QUERY.addEventListener("change", onHudQueryChange);
    } else if (HUD_MOBILE_QUERY.addListener) {
      HUD_MOBILE_QUERY.addListener(onHudQueryChange);
    }
  }

  applyHudLayout();

  /* =========================================================
     KEYBOARD
     ========================================================= */
  const KEY_MAP = {
    w: "forward",
    arrowup: "forward",
    s: "backward",
    arrowdown: "backward",
    a: "left",
    arrowleft: "left",
    d: "right",
    arrowright: "right"
  };

  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (key.indexOf("arrow") === 0) {
      event.preventDefault();
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const action = KEY_MAP[key];
    if (action) {
      GAME.keys[action] = true;
    }
  });

  window.addEventListener("keyup", event => {
    const action = KEY_MAP[event.key.toLowerCase()];
    if (action) {
      GAME.keys[action] = false;
    }
  });


  /* =========================================================
     MOBILE CONTROLS — TOUCH-SAFE REPAIR
     ========================================================= */
  const mobile = document.createElement("div");
  mobile.id = "cq-mobile-controls";
  mobile.style.cssText =
    "position:fixed;" +
    "bottom:calc(18px + env(safe-area-inset-bottom, 0px));" +
    "left:0;right:0;z-index:10000;" +
    "display:flex;justify-content:space-between;" +
    "align-items:flex-end;box-sizing:border-box;" +
    "padding:0 12px;pointer-events:none;" +
    "isolation:isolate;";

  document.body.appendChild(mobile);

  function makeButton(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", label);

    button.style.cssText =
      "width:68px;height:60px;box-sizing:border-box;" +
      "border:2px solid rgba(0,234,255,.8);" +
      "border-radius:14px;background:rgba(0,0,0,.88);" +
      "color:#fff;font-size:13px;font-weight:bold;" +
      "touch-action:none;pointer-events:auto;" +
      "user-select:none;-webkit-user-select:none;" +
      "-webkit-tap-highlight-color:transparent;" +
      "position:relative;z-index:10001;";

    let activePointer = null;

    function press(event) {
      if (activePointer !== null) return;

      event.preventDefault();
      event.stopPropagation();

      activePointer = event.pointerId;

      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
        /* Continue if pointer capture is unavailable. */
      }

      button.style.background = "rgba(0,100,130,.95)";
      button.style.transform = "scale(.96)";
      action(true);
    }

    function release(event) {
      if (activePointer === null) return;

      if (
        event.pointerId !== undefined &&
        event.pointerId !== activePointer
      ) {
        return;
      }

      const pointer = activePointer;
      activePointer = null;

      if (event.cancelable) event.preventDefault();

      button.style.background = "rgba(0,0,0,.88)";
      button.style.transform = "scale(1)";
      action(false);

      try {
        if (button.hasPointerCapture(pointer)) {
          button.releasePointerCapture(pointer);
        }
      } catch (error) {
        /* The input has already been released. */
      }
    }

    button.addEventListener("pointerdown", press, { passive: false });
    button.addEventListener("pointerup", release, { passive: false });
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);

    /* Prevent browser focus behavior from interfering with taps. */
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
    });

    return button;
  }

  const controlsLeft = document.createElement("div");
  controlsLeft.style.cssText =
    "display:flex;gap:7px;align-items:flex-end;" +
    "pointer-events:none;";

  controlsLeft.appendChild(
    makeButton("LEFT", value => {
      GAME.keys.left = value;
    })
  );

  controlsLeft.appendChild(
    makeButton("RIGHT", value => {
      GAME.keys.right = value;
    })
  );

  const controlsRight = document.createElement("div");
  controlsRight.style.cssText =
    "display:flex;gap:7px;align-items:flex-end;" +
    "pointer-events:none;";

  controlsRight.appendChild(
    makeButton("BRAKE", value => {
      GAME.keys.backward = value;
    })
  );

  controlsRight.appendChild(
    makeButton("GAS", value => {
      GAME.keys.forward = value;
    })
  );

  mobile.appendChild(controlsLeft);
  mobile.appendChild(controlsRight);

  /* Shared state used by drivercontrols.js and tapedeck.js. */
  GAME.analogSteer = null;
  GAME.ui = {
    mobile,
    steerButtons: controlsLeft
  };

  window.CQGame = GAME;

  /* =========================================================
     FREE-LOOK CAMERA
     DRIVE = follow camera. LOOK = same camera, but the player
     can look around independently. The car is never rotated.
     ========================================================= */
  const LOOK = {
    mode: "DRIVE",
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    maxPitch: Math.PI * 0.35,
    dragYawPerPixel: 0.006,
    dragPitchPerPixel: 0.005,
    keyYawSpeed: 1.8,
    keyPitchSpeed: 1.2,
    followRate: 12,
    returnRate: 3,
    maxReturnSpeed: 5,
    keys: { left: false, right: false, up: false, down: false },
    dragPointer: null,
    lastX: 0,
    lastY: 0
  };

  function wrapAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function clearLookKeys() {
    LOOK.keys.left = false;
    LOOK.keys.right = false;
    LOOK.keys.up = false;
    LOOK.keys.down = false;
  }

  /* camera button + mode indicator (top-right) */
  const cameraPanel = document.createElement("div");
  cameraPanel.style.cssText =
    "position:fixed;top:14px;right:10px;width:112px;box-sizing:border-box;" +
    "z-index:26;font-family:Arial,sans-serif;color:#fff;text-align:center;" +
    "pointer-events:none;";
  document.body.appendChild(cameraPanel);

  const cameraButton = document.createElement("button");
  cameraButton.type = "button";
  cameraButton.textContent = "CAMERA VIEW";
  cameraButton.style.cssText =
    "width:100%;height:40px;border-radius:10px;font-size:12px;" +
    "font-weight:bold;letter-spacing:.5px;cursor:pointer;" +
    "touch-action:manipulation;pointer-events:auto;";
  cameraPanel.appendChild(cameraButton);

  const cameraStatus = document.createElement("div");
  cameraStatus.style.cssText =
    "margin-top:6px;padding:4px 6px;font-size:11px;line-height:1.35;" +
    "background:rgba(0,0,0,.55);border-radius:6px;";
  cameraPanel.appendChild(cameraStatus);

  /* objective readout: nearest / quest location + distance */
  const objectivePanel = document.createElement("div");
  objectivePanel.style.cssText =
    "margin-top:6px;padding:5px 6px;font-size:12px;font-weight:bold;" +
    "line-height:1.35;background:rgba(0,0,0,.55);" +
    "border:1px solid rgba(0,234,255,.35);border-radius:6px;display:none;";
  cameraPanel.appendChild(objectivePanel);

  let cameraStatusHTML = "";

  function updateCameraPanel() {
    const looking = LOOK.mode === "LOOK";
    const html = looking
      ? 'CAMERA: LOOK<br><strong style="color:#22ff66">LOOK AROUND</strong>' +
        "<br>DRAG TO LOOK"
      : "CAMERA: DRIVE";

    if (html !== cameraStatusHTML) {
      cameraStatusHTML = html;
      cameraStatus.innerHTML = html;
    }

    cameraButton.style.border = looking
      ? "1px solid #22ff66"
      : "1px solid rgba(0,234,255,.6)";
    cameraButton.style.background = looking
      ? "rgba(0,60,30,.85)"
      : "rgba(0,0,0,.72)";
    cameraButton.style.color = looking ? "#22ff66" : "#ffffff";
    cameraButton.setAttribute("aria-pressed", looking ? "true" : "false");
    renderer.domElement.style.cursor = looking ? "grab" : "default";
  }

  function setCameraMode(mode) {
    if (LOOK.mode === mode) {
      return;
    }
    LOOK.mode = mode;
    LOOK.dragPointer = null;
    clearLookKeys();

    if (mode === "DRIVE") {
      LOOK.yaw = wrapAngle(LOOK.yaw);
      LOOK.targetYaw = 0;
      LOOK.targetPitch = 0;
    }
    updateCameraPanel();
  }

  function toggleCameraMode() {
    setCameraMode(LOOK.mode === "DRIVE" ? "LOOK" : "DRIVE");
  }

  cameraButton.addEventListener("click", () => {
    toggleCameraMode();
    cameraButton.blur();
  });

  /* STEER toggle: flips left/right for keys, buttons and wheel */
  const steerButton = document.createElement("button");
  steerButton.type = "button";
  steerButton.style.cssText =
    "width:100%;height:30px;margin-top:6px;border-radius:8px;" +
    "font-size:11px;font-weight:bold;letter-spacing:.5px;cursor:pointer;" +
    "touch-action:manipulation;pointer-events:auto;color:#fff;" +
    "background:rgba(0,0,0,.72);border:1px solid rgba(0,234,255,.6);";
  cameraPanel.insertBefore(steerButton, cameraStatus);

  function updateSteerButton() {
    steerButton.textContent =
      steerSign === 1 ? "STEER: NORMAL" : "STEER: FLIPPED";
  }

  function toggleSteerSign() {
    steerSign = -steerSign;
    try {
      window.localStorage.setItem(STEER_KEY, String(steerSign));
    } catch (error) {
      /* session only */
    }
    updateSteerButton();
    showMessage(steerSign === 1 ? "STEERING: NORMAL" : "STEERING: FLIPPED");
  }

  steerButton.addEventListener("click", () => {
    toggleSteerSign();
    steerButton.blur();
  });

  window.addEventListener("keydown", event => {
    if (
      event.key.toLowerCase() === "t" &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      toggleSteerSign();
    }
  });

  updateSteerButton();

  /* drag / swipe to look (canvas only) */
  const lookSurface = renderer.domElement;
  lookSurface.style.touchAction = "none";

  lookSurface.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  lookSurface.addEventListener("pointerdown", event => {
    if (LOOK.mode !== "LOOK" || LOOK.dragPointer !== null) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    LOOK.dragPointer = event.pointerId;
    LOOK.lastX = event.clientX;
    LOOK.lastY = event.clientY;
    try {
      lookSurface.setPointerCapture(event.pointerId);
    } catch (error) {
      /* capture is optional */
    }
    lookSurface.style.cursor = "grabbing";
    event.preventDefault();
  });

  lookSurface.addEventListener("pointermove", event => {
    if (LOOK.mode !== "LOOK" || event.pointerId !== LOOK.dragPointer) {
      return;
    }
    const dx = event.clientX - LOOK.lastX;
    const dy = event.clientY - LOOK.lastY;
    LOOK.lastX = event.clientX;
    LOOK.lastY = event.clientY;

    LOOK.targetYaw -= dx * LOOK.dragYawPerPixel;
    LOOK.targetPitch -= dy * LOOK.dragPitchPerPixel;
    LOOK.targetPitch = THREE.MathUtils.clamp(
      LOOK.targetPitch,
      -LOOK.maxPitch,
      LOOK.maxPitch
    );
    event.preventDefault();
  });

  function endLookDrag(event) {
    if (event.pointerId !== LOOK.dragPointer) {
      return;
    }
    LOOK.dragPointer = null;
    lookSurface.style.cursor = LOOK.mode === "LOOK" ? "grab" : "default";
  }

  lookSurface.addEventListener("pointerup", endLookDrag);
  lookSurface.addEventListener("pointercancel", endLookDrag);

  /* C toggles, Q/E/R/F look (hold) */
  window.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();

    if (key === "c") {
      if (!event.repeat) {
        toggleCameraMode();
      }
      return;
    }
    if (key === "q") LOOK.keys.left = true;
    if (key === "e") LOOK.keys.right = true;
    if (key === "r") LOOK.keys.up = true;
    if (key === "f") LOOK.keys.down = true;
  });

  window.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (key === "q") LOOK.keys.left = false;
    if (key === "e") LOOK.keys.right = false;
    if (key === "r") LOOK.keys.up = false;
    if (key === "f") LOOK.keys.down = false;
  });

  /* losing focus must not leave keys stuck */
  window.addEventListener("blur", () => {
    clearLookKeys();
    LOOK.dragPointer = null;
    releaseDrivingKeys();
  });

  function updateLook(delta) {
    if (LOOK.mode === "LOOK") {
      if (LOOK.keys.left) LOOK.targetYaw += LOOK.keyYawSpeed * delta;
      if (LOOK.keys.right) LOOK.targetYaw -= LOOK.keyYawSpeed * delta;
      if (LOOK.keys.up) LOOK.targetPitch += LOOK.keyPitchSpeed * delta;
      if (LOOK.keys.down) LOOK.targetPitch -= LOOK.keyPitchSpeed * delta;

      LOOK.targetPitch = THREE.MathUtils.clamp(
        LOOK.targetPitch,
        -LOOK.maxPitch,
        LOOK.maxPitch
      );

      if (Math.abs(LOOK.targetYaw) > Math.PI * 4) {
        const shift =
          Math.round(LOOK.targetYaw / (Math.PI * 2)) * Math.PI * 2;
        LOOK.targetYaw -= shift;
        LOOK.yaw -= shift;
      }
    }

    const returning = LOOK.mode === "DRIVE";
    const rate = returning ? LOOK.returnRate : LOOK.followRate;
    const blend = 1 - Math.exp(-rate * delta);

    let stepYaw = (LOOK.targetYaw - LOOK.yaw) * blend;
    let stepPitch = (LOOK.targetPitch - LOOK.pitch) * blend;

    if (returning) {
      const maxStep = LOOK.maxReturnSpeed * delta;
      stepYaw = THREE.MathUtils.clamp(stepYaw, -maxStep, maxStep);
      stepPitch = THREE.MathUtils.clamp(stepPitch, -maxStep, maxStep);
    }

    LOOK.yaw += stepYaw;
    LOOK.pitch += stepPitch;
    LOOK.pitch = THREE.MathUtils.clamp(
      LOOK.pitch,
      -LOOK.maxPitch,
      LOOK.maxPitch
    );

    if (
      LOOK.mode === "DRIVE" &&
      Math.abs(LOOK.yaw) < 0.0005 &&
      Math.abs(LOOK.pitch) < 0.0005
    ) {
      LOOK.yaw = 0;
      LOOK.pitch = 0;
    }
  }

  updateCameraPanel();

  /* =========================================================
     CITY DISCOVERY
     Locations sit on EXISTING city buildings from the
     generator (track.destinations), each with a beacon.
     ========================================================= */
  const LOCATION_DEFS = [
    { id: "tech_hub", name: "TECH HUB", type: "quest", buildingType: "radio_station" },
    { id: "garage", name: "GARAGE", type: "garage", buildingType: "auto_shop" },
    { id: "studio", name: "STUDIO", type: "studio", buildingType: "record_store" },
    { id: "shop", name: "SHOP", type: "shop", buildingType: "clothing_store" },
    { id: "office", name: "OFFICE", type: "office", buildingType: "bank" }
  ];

  const DISCOVERY = {
    arriveRadius: 45,
    discoverRadius: 18,
    questTargetId: "tech_hub",
    questState: "none", /* "none" -> "active" -> "complete" */
    beaconHeight: 70,
    time: 0,
    queue: [],
    bannerTimer: 0,
    bannerGap: 0
  };

  const BEACON_COLORS = {
    undiscovered: 0x00eaff,
    quest: 0xff2bd6,
    discovered: 0x22ff66
  };

  const LOCATIONS = [];

  LOCATION_DEFS.forEach(definition => {
    const building = (track.destinations || []).find(
      candidate =>
        candidate.userData &&
        candidate.userData.buildingType === definition.buildingType
    );

    if (!building || !building.geometry || !building.geometry.parameters) {
      console.warn("CodeQuestER: no building for location " + definition.id);
      return;
    }

    const size = building.geometry.parameters;

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, DISCOVERY.beaconHeight, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: BEACON_COLORS.undiscovered,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false
      })
    );
    beacon.position.set(
      building.position.x,
      size.height + DISCOVERY.beaconHeight / 2,
      building.position.z
    );
    beacon.name = "LocationBeacon_" + definition.id;
    beacon.userData = { type: "locationBeacon", locationId: definition.id };
    scene.add(beacon);

    LOCATIONS.push({
      id: definition.id,
      name: definition.name,
      type: definition.type,
      position: new THREE.Vector3(building.position.x, 0, building.position.z),
      halfWidth: size.width / 2,
      halfDepth: size.depth / 2,
      discovered: false,
      beacon
    });
  });

  function discoveredCount() {
    let count = 0;
    for (let i = 0; i < LOCATIONS.length; i++) {
      if (LOCATIONS[i].discovered) {
        count++;
      }
    }
    return count;
  }

  function findLocation(id) {
    for (let i = 0; i < LOCATIONS.length; i++) {
      if (LOCATIONS[i].id === id) {
        return LOCATIONS[i];
      }
    }
    return null;
  }

  /* If the Tech Hub building is missing, fall back to the first
     location that did resolve instead of never starting. */
  if (!findLocation(DISCOVERY.questTargetId) && LOCATIONS.length > 0) {
    console.warn("CodeQuestER: quest target missing, using " + LOCATIONS[0].id);
    DISCOVERY.questTargetId = LOCATIONS[0].id;
  }

  function questTargetName() {
    const target = findLocation(DISCOVERY.questTargetId);
    return target ? target.name : "TECH HUB";
  }

  function prettyName(name) {
    return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  function questHudText() {
    if (DISCOVERY.questState === "active") {
      return "FIND " + questTargetName();
    }
    if (DISCOVERY.questState === "complete") {
      return "COMPLETE";
    }
    return "NONE";
  }

  /* distance from the car to the edge of the building footprint */
  function distanceToLocation(location) {
    const dx = Math.max(
      Math.abs(car.position.x - location.position.x) - location.halfWidth,
      0
    );
    const dz = Math.max(
      Math.abs(car.position.z - location.position.z) - location.halfDepth,
      0
    );
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* banner (queued so messages never overwrite each other) */
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);" +
    "z-index:31;font-family:Arial,sans-serif;color:#fff;text-align:center;" +
    "text-shadow:0 0 14px #00eaff;pointer-events:none;opacity:0;" +
    "transition:opacity .25s;";

  const bannerHead = document.createElement("div");
  bannerHead.style.cssText = "font-size:14px;letter-spacing:3px;color:#00eaff;";
  const bannerBody = document.createElement("div");
  bannerBody.style.cssText = "font-size:24px;font-weight:bold;";

  banner.appendChild(bannerHead);
  banner.appendChild(bannerBody);
  document.body.appendChild(banner);

  function enqueueBanner(head, body, seconds) {
    DISCOVERY.queue.push({ head, body, seconds });
  }

  function updateBanner(delta) {
    if (DISCOVERY.bannerTimer > 0) {
      DISCOVERY.bannerTimer -= delta;
      if (DISCOVERY.bannerTimer <= 0) {
        banner.style.opacity = "0";
        DISCOVERY.bannerGap = 0.35;
      }
      return;
    }

    if (DISCOVERY.bannerGap > 0) {
      DISCOVERY.bannerGap -= delta;
      return;
    }

    if (DISCOVERY.queue.length > 0) {
      const next = DISCOVERY.queue.shift();
      bannerHead.textContent = next.head;
      bannerBody.textContent = next.body;
      banner.style.opacity = "1";
      DISCOVERY.bannerTimer = next.seconds;
    }
  }

  function refreshBeaconColors() {
    for (let i = 0; i < LOCATIONS.length; i++) {
      const location = LOCATIONS[i];
      let color = BEACON_COLORS.undiscovered;

      if (location.discovered) {
        color = BEACON_COLORS.discovered;
      } else if (
        DISCOVERY.questState === "active" &&
        location.id === DISCOVERY.questTargetId
      ) {
        color = BEACON_COLORS.quest;
      }
      location.beacon.material.color.setHex(color);
    }
  }

  function completeQuest() {
    DISCOVERY.questState = "complete";
    enqueueBanner("QUEST COMPLETE", questTargetName() + " DISCOVERED", 3);
  }

  function discoverLocation(location) {
    location.discovered = true;
    enqueueBanner("LOCATION DISCOVERED", location.name, 2.4);

    const questTarget = findLocation(DISCOVERY.questTargetId);

    if (questTarget) {
      if (DISCOVERY.questState === "none") {
        if (location === questTarget) {
          completeQuest();
        } else {
          DISCOVERY.questState = "active";
          enqueueBanner(
            "NEW QUEST",
            "Find the " + prettyName(questTarget.name) + ".",
            3
          );
        }
      } else if (
        DISCOVERY.questState === "active" &&
        location === questTarget
      ) {
        completeQuest();
      }
    }

    if (discoveredCount() === LOCATIONS.length) {
      enqueueBanner("CITY DISCOVERY", "ALL LOCATIONS DISCOVERED", 3);
    }

    refreshBeaconColors();
  }

  let objectiveHTML = "";

  function setObjective(html) {
    if (html === objectiveHTML) {
      return;
    }
    objectiveHTML = html;
    objectivePanel.innerHTML = html;
    objectivePanel.style.display = html ? "block" : "none";
  }

  function updateDiscovery(delta) {
    DISCOVERY.time += delta;

    const pulse = 0.45 + 0.2 * Math.sin(DISCOVERY.time * 3);

    let nearest = null;
    let nearestDistance = Infinity;

    for (let i = 0; i < LOCATIONS.length; i++) {
      const location = LOCATIONS[i];

      if (location.discovered) {
        location.beacon.material.opacity = 0.3;
        continue;
      }

      location.beacon.material.opacity = pulse;

      const distance = distanceToLocation(location);

      if (distance <= DISCOVERY.discoverRadius) {
        discoverLocation(location);
        continue;
      }

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = location;
      }
    }

    let target = nearest;

    if (DISCOVERY.questState === "active") {
      const questTarget = findLocation(DISCOVERY.questTargetId);
      if (questTarget && !questTarget.discovered) {
        target = questTarget;
      }
    }

    if (target && !target.discovered) {
      const distance = distanceToLocation(target);
      const text =
        distance <= DISCOVERY.arriveRadius
          ? "ARRIVING"
          : Math.round(distance) + "m";
      setObjective(target.name + "<br>" + text);
    } else {
      setObjective("");
    }

    updateBanner(delta);
  }

  
  refreshBeaconColors();

  /* =========================================================
   CODEQUESTER — SHARED WORLD ACCESS
   Used by traffic NPCs and optional gameplay add-ons.
   ========================================================= */

window.CQWorld = {
  scene: scene,
  camera: camera,
  renderer: renderer,
  car: car,
  locations: LOCATIONS,
  THREE: THREE,
  track: waypoints
};

  /* =========================================================
   CLOSEST TRACK POINT (informational only)
   ========================================================= */
function findClosestWaypoint() {
  let closest = GAME.trackIndex;
  let closestDistance = Infinity;
  const searchRadius = 35;

  for (let offset = -searchRadius; offset <= searchRadius; offset++) {
    const index =
      (GAME.trackIndex + offset + TRACK_COUNT) % TRACK_COUNT;
    const point = waypoints[index];
    const dx = car.position.x - point.x;
    const dz = car.position.z - point.z;
    const distance = dx * dx + dz * dz;

    if (distance < closestDistance) {
      closestDistance = distance;
      closest = index;
    }
  }

  GAME.trackIndex = closest;
}

  /* =========================================================
     STEERING (k = frame scale: 1 at 60fps, 0.5 at 120fps)
     ========================================================= */
  function updateSteering(k) {
    let input = 0;

    if (GAME.keys.left) {
      input -= 1;
    }
    if (GAME.keys.right) {
      input += 1;
    }

    /* drivercontrols.js sets analogSteer (-1..+1) while the
       on-screen wheel is in use, and null when idle. */
    if (typeof GAME.analogSteer === "number") {
      input = THREE.MathUtils.clamp(GAME.analogSteer, -1, 1);
    }

    GAME.steeringTarget = input;
    GAME.steering = THREE.MathUtils.lerp(
      GAME.steering,
      GAME.steeringTarget,
      1 - Math.pow(1 - 0.14, k)
    );

    const speedFactor = THREE.MathUtils.clamp(
      Math.abs(GAME.speed) / GAME.maxSpeed,
      0.25,
      1
    );
    const steeringAmount =
      GAME.steering * GAME.steeringPower * speedFactor * k;

    /* The car faces local -Z, so +rotation.y turns LEFT.
       steerSign flips the result if it looks backwards. */
    car.rotation.y -= steeringAmount * steerSign;

    frontWheels.forEach(wheel => {
      wheel.rotation.y = -GAME.steering * 0.45 * steerSign;
    });
  }

  /* =========================================================
     CAR MOVEMENT
     ========================================================= */
  
  const moveForward = new THREE.Vector3();

  
/* =========================================================
   BUILDING COLLISION + CAR PHYSICS
   Preserves existing building meshes and city visuals.
   Includes wall sliding, gradual acceleration, braking,
   reverse, steering, wheel animation, and waypoint checks.
   ========================================================= */

const CAR_HALF_WIDTH = 1.125;
const CAR_HALF_LENGTH = 2.075;

const collisionBuildings = [];
const seenBuildings = new Set();

function registerBuilding(building) {
  if (
    !building ||
    seenBuildings.has(building) ||
    !building.geometry ||
    !building.position
  ) {
    return;
  }

  seenBuildings.add(building);

  const geometry = building.geometry;
  let width = geometry.parameters?.width;
  let depth = geometry.parameters?.depth;

  if (!(width > 0) || !(depth > 0)) {
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    const bounds = geometry.boundingBox;
    if (!bounds) return;

    width = bounds.max.x - bounds.min.x;
    depth = bounds.max.z - bounds.min.z;
  }

  if (!(width > 0) || !(depth > 0)) return;

  collisionBuildings.push({
    mesh: building,
    halfWidth: width * Math.abs(building.scale.x) / 2,
    halfDepth: depth * Math.abs(building.scale.z) / 2
  });
}

(track.buildings || []).forEach(registerBuilding);
(track.destinations || []).forEach(registerBuilding);

/* Rectangle collision test: car versus building. */
function overlapsBuilding(x, z, carAngle, collider) {
  const building = collider.mesh;

  const bx = building.position.x;
  const bz = building.position.z;
  const buildingAngle = building.rotation.y || 0;

  const carCos = Math.cos(carAngle);
  const carSin = Math.sin(carAngle);
  const buildingCos = Math.cos(buildingAngle);
  const buildingSin = Math.sin(buildingAngle);

  const dx = x - bx;
  const dz = z - bz;

  const axes = [
    [carCos, -carSin],
    [carSin, carCos],
    [buildingCos, -buildingSin],
    [buildingSin, buildingCos]
  ];

  for (const axis of axes) {
    const ax = axis[0];
    const az = axis[1];

    const distance = Math.abs(dx * ax + dz * az);

    const carRadius =
      CAR_HALF_WIDTH *
        Math.abs(carCos * ax - carSin * az) +
      CAR_HALF_LENGTH *
        Math.abs(carSin * ax + carCos * az);

    const buildingRadius =
      collider.halfWidth *
        Math.abs(buildingCos * ax - buildingSin * az) +
      collider.halfDepth *
        Math.abs(buildingSin * ax + buildingCos * az);

    if (distance >= carRadius + buildingRadius) {
      return false;
    }
  }

  return true;
}

function canMoveTo(x, z) {
  for (const collider of collisionBuildings) {
    if (
      overlapsBuilding(
        x,
        z,
        car.rotation.y,
        collider
      )
    ) {
      return false;
    }
  }

  return true;
}

/* Move on each axis separately so the car slides along walls. */
function moveCarWithCollision(dx, dz) {
  let movedX = false;
  let movedZ = false;

  const nextX = car.position.x + dx;

  if (canMoveTo(nextX, car.position.z)) {
    car.position.x = nextX;
    movedX = true;
  }

  const nextZ = car.position.z + dz;

  if (canMoveTo(car.position.x, nextZ)) {
    car.position.z = nextZ;
    movedZ = true;
  }

  /* Stop the car if a building blocks both movement directions. */
  if (!movedX && !movedZ) {
    GAME.speed = 0;
  }
}

/* =========================================================
   CAR PHYSICS
   ========================================================= */
function updateCar(delta, k) {
  /* Prevent large movement jumps after a lag spike. */
  const safeK = Math.min(Math.max(k, 0), 3);

  /* GAS: accelerate only while forward is held.
     Do not accelerate forward while the brake is held. */
  if (GAME.keys.forward && !GAME.keys.backward) {
    GAME.speed += GAME.acceleration * safeK;
  }

  /* BRAKE / REVERSE */
  if (GAME.keys.backward) {
    if (GAME.speed > 0) {
      GAME.speed = Math.max(
        0,
        GAME.speed - GAME.braking * safeK
      );
    } else {
      GAME.speed -= GAME.acceleration * 0.6 * safeK;
    }
  }

  /* Release both pedals: coast and slow down naturally. */
  if (!GAME.keys.forward && !GAME.keys.backward) {
    if (GAME.speed > 0) {
      GAME.speed = Math.max(
        0,
        GAME.speed - GAME.friction * safeK
      );
    } else if (GAME.speed < 0) {
      GAME.speed = Math.min(
        0,
        GAME.speed + GAME.friction * safeK
      );
    }
  }

  /* Temporary boost. */
  if (GAME.boostTimer > 0) {
    GAME.boostTimer = Math.max(0, GAME.boostTimer - delta);
    GAME.boostPower = 1.45;
  } else {
    GAME.boostPower = 1;
  }

  /* Enforce forward and reverse speed limits. */
  GAME.speed = THREE.MathUtils.clamp(
    GAME.speed,
    -GAME.reverseSpeed,
    GAME.maxSpeed * GAME.boostPower
  );

  /* Preserve existing steering behavior. */
  updateSteering(safeK);

  /* Calculate forward movement from the car's orientation. */
  moveForward
    .set(0, 0, -1)
    .applyQuaternion(car.quaternion);

  const moveX = moveForward.x * GAME.speed * safeK;
  const moveZ = moveForward.z * GAME.speed * safeK;

  /* Apply movement through the existing building collision. */
  moveCarWithCollision(moveX, moveZ);

  /* Animate the wheels according to car speed. */
  wheels.forEach(wheel => {
    wheel.rotation.x -= GAME.speed * 2.2 * safeK;
  });

  /* Keep distance and waypoint systems running. */
  GAME.distance += Math.abs(GAME.speed) * safeK;

  findClosestWaypoint();
}


  /* =========================================================
     ZONES, BOOSTS, RAMPS
     ========================================================= */
  let flashTimer = null;

  /* Translation of ColorZone.cs behavior */
  function applyColorBoost(zone) {
    switch (zone.userData.color) {
      case "RED":
        GAME.maxSpeed = Math.min(GAME.maxSpeed + 0.08, 1.05);
        GAME.score += 100;
        showMessage("RED BOOST");
        break;
      case "GREEN":
        GAME.acceleration = Math.min(GAME.acceleration + 0.002, 0.028);
        GAME.score += 100;
        showMessage("GREEN BOOST");
        break;
      case "BLUE":
        GAME.steeringPower = Math.min(GAME.steeringPower + 0.004, 0.055);
        GAME.score += 100;
        showMessage("BLUE BOOST");
        break;
    }

    bodyMaterial.color.setHex(zone.userData.boostColor);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      bodyMaterial.color.setHex(BODY_BASE_COLOR);
    }, 450);
  }

  function jumpCar() {
    GAME.airborne = true;
    GAME.jumpVelocity = 0.26;
    GAME.score += 75;
    showMessage("JUMP!");
  }

  function updateJump(k) {
    if (!GAME.airborne) {
      return;
    }

    car.position.y += GAME.jumpVelocity * k;
    GAME.jumpVelocity -= 0.018 * k;

    if (car.position.y <= 0) {
      car.position.y = 0;
      GAME.airborne = false;
      GAME.jumpVelocity = 0;
    }
  }

  function checkInteractiveObjects() {
    const cx = car.position.x;
    const cz = car.position.z;

    track.zones.forEach(object => {
      if (!object.userData || !object.userData.active) {
        return;
      }

      const distance = Math.hypot(
        cx - object.position.x,
        cz - object.position.z
      );

      if (distance > ROAD_WIDTH * 0.65) {
        return;
      }

      if (object.userData.type === "colorZone") {
        applyColorBoost(object);
        object.userData.active = false;
      }

      if (object.userData.type === "speedBoost") {
        GAME.boostTimer = 3.0;
        GAME.score += 50;
        showMessage("SPEED BOOST");
        object.userData.active = false;
        object.scale.y = 0.35;
      }
    });

    track.ramps.forEach(ramp => {
      const distance = Math.hypot(
        cx - ramp.position.x,
        cz - ramp.position.z
      );

      if (distance < 4 && !GAME.airborne && Math.abs(GAME.speed) > 0.25) {
        jumpCar();
      }
    });
  }

  /* =========================================================
     LAP DETECTION
     ========================================================= */
  function updateLap() {
    const current = GAME.trackIndex;

    if (
      GAME.lastTrackIndex > TRACK_COUNT * 0.8 &&
      current < TRACK_COUNT * 0.2
    ) {
      GAME.lap++;
      GAME.score += 500;
      showMessage("LAP COMPLETE");
    }

    GAME.lastTrackIndex = current;
  }

  /* =========================================================
     CAMERA
     ========================================================= */
  const cameraPosition = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();

  /* Rotate the driving view by the player's look yaw / pitch.
     In DRIVE mode both settle at 0, so the camera is unchanged. */
  function applyLookOffset() {
    if (Math.abs(LOOK.yaw) < 0.0001 && Math.abs(LOOK.pitch) < 0.0001) {
      return;
    }

    const dx = cameraTarget.x - camera.position.x;
    const dy = cameraTarget.y - camera.position.y;
    const dz = cameraTarget.z - camera.position.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    const baseYaw = Math.atan2(-dx, -dz);
    const basePitch = Math.asin(THREE.MathUtils.clamp(dy / length, -1, 1));

    const yaw = baseYaw + LOOK.yaw;
    const pitch = THREE.MathUtils.clamp(basePitch + LOOK.pitch, -1.4, 1.4);
    const flat = Math.cos(pitch);

    cameraTarget.set(
      camera.position.x - Math.sin(yaw) * flat * length,
      camera.position.y + Math.sin(pitch) * length,
      camera.position.z - Math.cos(yaw) * flat * length
    );
  }

  function updateCamera(k) {
    cameraForward.set(0, 0, -1).applyQuaternion(car.quaternion);

    cameraPosition.copy(car.position);
    cameraPosition.addScaledVector(cameraForward, -10);
    cameraPosition.y += 5.5;

    camera.position.lerp(cameraPosition, 1 - Math.pow(1 - 0.08, k));

    cameraTarget.copy(car.position);
    cameraTarget.addScaledVector(cameraForward, 8);
    cameraTarget.y += 1;

    applyLookOffset();
    camera.lookAt(cameraTarget);
  }

  /* =========================================================
     RESIZE
     ========================================================= */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* =========================================================
     START + GAME LOOP
     ========================================================= */
  showMessage("CODEQUESTER");

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const k = delta * 60; /* 1.0 at 60fps */

    
    updateCar(delta, k);
    updateJump(k);
    checkInteractiveObjects();
    updateLap();
    updateDiscovery(delta);

    
    /* Energy Vampire gameplay add-on. */
    if (window.CQEnergyVampires) {
      window.CQEnergyVampires.update(delta);
    }

    /* Traffic vehicles and walking NPCs. */
    if (window.CQTrafficNPCs) {
      window.CQTrafficNPCs.update(delta);
    }

    /* City visuals frame update: skybox/backdrop follow, vinyl
       spin, billboard slides, theatre GIF. */
    if (window.CQCityVisuals) {
      window.CQCityVisuals.update(delta, car.position);
    }

    updateLook(delta);
    updateSun();
    updateCamera(k);
    updateMessage(delta);
    updateHUD();

    renderer.render(scene, camera);
  }

  updateHUD();
  animate();
})();
