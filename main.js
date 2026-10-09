/* =========================================================
   CODEQUESTER — MAIN GAME
   Three.js r156 — FREE DRIVING BUILD
   Load order: music.js, main.js, drivercontrols.js, tapedeck.js

   CONTROLS
   W / Up     Accelerate        A / Left   Steer left
   S / Down   Brake / Reverse   D / Right  Steer right
   C          Toggle DRIVE / LOOK camera
   Q E R F    Look around (LOOK mode)
   M / N      Radio play-pause / next (drivercontrols.js)

   MOBILE
   On-screen steering + throttle/brake (steering wheel is
   added by drivercontrols.js).

   NOTES
   - Free driving: nothing pulls the car back to the road.
   - Physics is scaled by frame time, so speed is the same on
     60Hz and 120Hz screens.
   - City discovery: five landmarks on existing city buildings.
   ========================================================= */
(() => {
  "use strict";

  /* STEERING DIRECTION
     Tap the STEER button (top-right) or press T to flip
     left/right. The choice is saved in this browser. */
  const STEER_KEY = "codequester.steerSign.v1";
  let steerSign = -1;

  try {
    const saved = window.localStorage.getItem(STEER_KEY);
    if (saved === "1" || saved === "-1") {
      steerSign = Number(saved);
    }
  } catch (error) {
    /* storage blocked: the toggle still works for this session */
  }

  /* =========================================================
     GAME STATE
     ========================================================= */
  const GAME = {
    speed: 0,
    maxSpeed: 0.72,
    reverseSpeed: 0.22,
    acceleration: 0.014,
    braking: 0.035,
    friction: 0.009,
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
     The sun (and its shadow box) follows the car, so shadows
     keep working anywhere in the free-driving world.
     ========================================================= */
  scene.add(new THREE.HemisphereLight(0x8fd8ff, 0x05070b, 1.7));

  const SUN_OFFSET = new THREE.Vector3(-60, 90, 40);
  const SUN_SNAP = 20; /* snap to a grid so shadows don't shimmer */

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
    sun.position.set(
      x + SUN_OFFSET.x,
      SUN_OFFSET.y,
      z + SUN_OFFSET.z
    );
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
  const hud = document.createElement("div");
  hud.style.cssText =
    "position:fixed;top:14px;left:14px;z-index:20;" +
    "font-family:Arial,sans-serif;color:#fff;background:rgba(0,0,0,.72);" +
    "border:1px solid rgba(0,234,255,.4);padding:12px 16px;" +
    "border-radius:8px;min-width:190px;line-height:1.45;";
  document.body.appendChild(hud);

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

  let hudHTML = "";

  /* Only touches the DOM when the text actually changes. */
  function updateHUD() {
    const mph = Math.round(Math.abs(GAME.speed) * 145);
    const boost = GAME.boostTimer > 0 ? "ACTIVE" : "READY";

    const html =
      "<strong>CODEQUESTER</strong><br>" +
      "SPEED: " + mph + "<br>" +
      "LAP: " + GAME.lap + "<br>" +
      "SCORE: " + GAME.score + "<br>" +
      "BOOST: " + boost + "<br>" +
      "TRACK: " + (GAME.trackIndex + 1) + "/" + TRACK_COUNT + "<br>" +
      "DISCOVERED: " + discoveredCount() + " / " + LOCATIONS.length + "<br>" +
      "QUEST: " + questHudText() + "<br><br>" +
      "W / \u2191  ACCELERATE<br>" +
      "S / \u2193  BRAKE<br>" +
      "A / \u2190  LEFT<br>" +
      "D / \u2192  RIGHT<br>" +
      "C  CAMERA VIEW<br>" +
      "Q E R F  LOOK<br>" +
      "M  RADIO   N  NEXT";

    if (html !== hudHTML) {
      hudHTML = html;
      hud.innerHTML = html;
    }
  }

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
     MOBILE CONTROLS
     ========================================================= */
  const mobile = document.createElement("div");
  mobile.style.cssText =
    "position:fixed;bottom:20px;left:0;right:0;z-index:25;display:flex;" +
    "justify-content:space-between;padding:0 18px;pointer-events:none;";
  document.body.appendChild(mobile);

  function makeButton(label, action) {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText =
      "width:72px;height:58px;border:1px solid rgba(0,234,255,.6);" +
      "border-radius:12px;background:rgba(0,0,0,.72);color:#fff;" +
      "font-size:18px;font-weight:bold;touch-action:none;" +
      "pointer-events:auto;";

    function press(event) {
      event.preventDefault();
      action(true);
    }
    function release(event) {
      event.preventDefault();
      action(false);
    }

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
    return button;
  }

  const controlsLeft = document.createElement("div");
  controlsLeft.style.cssText = "display:flex;gap:8px;";
  controlsLeft.appendChild(
    makeButton("LEFT", value => { GAME.keys.left = value; })
  );
  controlsLeft.appendChild(
    makeButton("RIGHT", value => { GAME.keys.right = value; })
  );

  const controlsRight = document.createElement("div");
  controlsRight.style.cssText = "display:flex;gap:8px;";
  controlsRight.appendChild(
    makeButton("BRAKE", value => { GAME.keys.backward = value; })
  );
  controlsRight.appendChild(
    makeButton("GAS", value => { GAME.keys.forward = value; })
  );

  mobile.appendChild(controlsLeft);
  mobile.appendChild(controlsRight);

  /* Exposed for drivercontrols.js (steering wheel) and tapedeck.js. */
  GAME.analogSteer = null;
  GAME.ui = {
    mobile,
    steerButtons: controlsLeft
  };
  window.CQGame = GAME;

  /* =========================================================
     FREE-LOOK CAMERA
     DRIVE = the follow camera (default).
     LOOK  = same follow camera, but the player can look around
             independently. The car is never rotated.
     ========================================================= */
  const LOOK = {
    mode: "DRIVE",
    yaw: 0, /* radians: +yaw looks left, +pitch looks up */
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
      /* go home the short way round, then ease back to 0 */
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

  /* drag / swipe to look (canvas only, so driving buttons
     keep working and a second finger can still steer) */
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

    /* drag left -> look left (+yaw), drag up -> look up (+pitch) */
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
      return; /* leave browser shortcuts alone */
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

  /* losing focus (alt-tab etc.) must not leave keys stuck */
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

      /* horizontal look is free, but keep numbers small */
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
      /* ease home at a limited angular speed so a big look
         angle never whips back */
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
     generator (track.destinations). Each gets one cheap glowing
     beacon so it can be spotted from far away.
     Change the table to re-map names to buildings.
     ========================================================= */
  const LOCATION_DEFS = [
    { id: "tech_hub", name: "TECH HUB", type: "quest", buildingType: "radio_station" },
    { id: "garage", name: "GARAGE", type: "garage", buildingType: "auto_shop" },
    { id: "studio", name: "STUDIO", type: "studio", buildingType: "record_store" },
    { id: "shop", name: "SHOP", type: "shop", buildingType: "clothing_store" },
    { id: "office", name: "OFFICE", type: "office", buildingType: "bank" }
  ];

  const DISCOVERY = {
    arriveRadius: 45,   /* metres from the building footprint */
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
      console.warn(
        "CodeQuestER: no building for location " + definition.id
      );
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

  /* If the Tech Hub building is missing, the quest falls back to
     the first location that did resolve instead of never starting. */
  if (!findLocation(DISCOVERY.questTargetId) && LOCATIONS.length > 0) {
    console.warn(
      "CodeQuestER: quest target missing, using " + LOCATIONS[0].id
    );
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

  /* distance from the car to the edge of the building footprint
     (0 when inside it) */
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

  /* banner (queued, so back-to-back messages never overwrite
     each other or the boost / jump messages) */
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);" +
    "z-index:31;font-family:Arial,sans-serif;color:#fff;text-align:center;" +
    "text-shadow:0 0 14px #00eaff;pointer-events:none;opacity:0;" +
    "transition:opacity .25s;";

  const bannerHead = document.createElement("div");
  bannerHead.style.cssText =
    "font-size:14px;letter-spacing:3px;color:#00eaff;";
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

  /* DRIVE -> DISCOVER -> QUEST -> COMPLETE */
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
          /* first find happens to be the quest target */
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

    /* gentle beacon pulse (undiscovered only) */
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

    /* objective readout: the quest target while the quest is
       active, otherwise the nearest undiscovered location */
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
     CLOSEST TRACK POINT
     Informational only: it does NOT restrict movement.
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
     STEERING
     k = frame scale (1 at 60fps, 0.5 at 120fps)
     ========================================================= */
  function updateSteering(k) {
    let input = 0;

    if (GAME.keys.left) {
      input -= 1;
    }
    if (GAME.keys.right) {
      input += 1;
    }

    /* On-screen steering wheel (drivercontrols.js) sets this to a
       number from -1 (full left) to +1 (full right) while in use,
       and back to null when idle so the keys work as before. */
    if (typeof GAME.analogSteer === "number") {
      input = THREE.MathUtils.clamp(GAME.analogSteer, -1, 1);
    }

    GAME.steeringTarget = input;
    GAME.steering = THREE.MathUtils.lerp(
      GAME.steering,
      GAME.steeringTarget,
      1 - Math.pow(1 - 0.14, k)
    );

    /* steering gets slightly stronger at higher speed */
    const speedFactor = THREE.MathUtils.clamp(
      Math.abs(GAME.speed) / GAME.maxSpeed,
      0.25,
      1
    );
    const steeringAmount =
      GAME.steering * GAME.steeringPower * speedFactor * k;

    /* The car faces local -Z, so +rotation.y turns LEFT and
       steering +1 means right. steerSign (top of file, toggled in game)
       flips the result if it looks backwards on screen. */
    car.rotation.y -= steeringAmount * steerSign;

    /* front wheel visual steering */
    frontWheels.forEach(wheel => {
      wheel.rotation.y = -GAME.steering * 0.45 * steerSign;
    });
  }

  /* =========================================================
     CAR MOVEMENT
     ========================================================= */
  const moveForward = new THREE.Vector3();

  function updateCar(delta, k) {
    if (GAME.keys.forward) {
      GAME.speed += GAME.acceleration * k;
    }

    if (GAME.keys.backward) {
      if (GAME.speed > 0) {
        GAME.speed -= GAME.braking * k;
      } else {
        GAME.speed -= GAME.acceleration * 0.6 * k;
      }
    }

    if (!GAME.keys.forward && !GAME.keys.backward) {
      if (GAME.speed > 0) {
        GAME.speed = Math.max(0, GAME.speed - GAME.friction * k);
      } else if (GAME.speed < 0) {
        GAME.speed = Math.min(0, GAME.speed + GAME.friction * k);
      }
    }

    if (GAME.boostTimer > 0) {
      GAME.boostTimer -= delta;
      GAME.boostPower = 1.45;
    } else {
      GAME.boostPower = 1;
    }

    GAME.speed = THREE.MathUtils.clamp(
      GAME.speed,
      -GAME.reverseSpeed,
      GAME.maxSpeed * GAME.boostPower
    );

    updateSteering(k);

    /* FREE DRIVING: nothing pulls the car back to the road. */
    moveForward.set(0, 0, -1).applyQuaternion(car.quaternion);
    car.position.addScaledVector(moveForward, GAME.speed * k);

    wheels.forEach(wheel => {
      wheel.rotation.x -= GAME.speed * 2.2 * k;
    });

    GAME.distance += Math.abs(GAME.speed) * k;

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

    /* flash the car with the zone color, then always return to the
       real base color (never to a previous flash color) */
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
     Only meaningful when actually driving around the track.
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

  /* Rotate the existing driving view by the player's look yaw /
     pitch. In DRIVE mode both settle at 0, so the normal driving
     camera is unchanged. */
  function applyLookOffset() {
    if (Math.abs(LOOK.yaw) < 0.0001 && Math.abs(LOOK.pitch) < 0.0001) {
      return;
    }

    const dx = cameraTarget.x - camera.position.x;
    const dy = cameraTarget.y - camera.position.y;
    const dz = cameraTarget.z - camera.position.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    /* yaw 0 = looking along -Z, positive yaw turns toward -X
       (the player's left) */
    const baseYaw = Math.atan2(-dx, -dz);
    const basePitch = Math.asin(THREE.MathUtils.clamp(dy / length, -1, 1));

    const yaw = baseYaw + LOOK.yaw;

    /* never reach straight up / down, so the camera cannot flip */
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
