/* =========================================================
   CODEQUESTER — MAIN GAME
   Three.js r156
   FREE DRIVING BUILD
   CONTROLS
   W / Arrow Up    Accelerate
   S / Arrow Down  Brake / Reverse
   A / Arrow Left  Steer
   D / Arrow Right Steer
   MOBILE
   On-screen steering + throttle/brake
   STEP 1:
   The player is no longer forced to stay on the track.
   The car can freely drive around the generated world.
   STEP 3 — FREE-LOOK CAMERA
   CAMERA VIEW button (or C) toggles DRIVE / LOOK.
   LOOK: drag / swipe the screen, or hold Q E R F.
   The car keeps driving and is never rotated by the camera.
   STEP 4 — CITY DISCOVERY
   Five landmarks on existing city buildings. Drive to them,
   discover them, and finish the first quest hook.
   ========================================================= */
(() => {
  "use strict";
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
  /* =========================================================
     SCENE
     ========================================================= */
  const scene =
    new THREE.Scene();
  scene.background =
    new THREE.Color(0x02050b);
  scene.fog =
    new THREE.Fog(
      0x02050b,
      70,
      260
    );
  /* =========================================================
     CAMERA
     ========================================================= */
  const camera =
    new THREE.PerspectiveCamera(
      65,
      window.innerWidth /
        window.innerHeight,
      0.1,
      1000
    );
  camera.position.set(
    0,
    6,
    10
  );
  /* =========================================================
     RENDERER
     ========================================================= */
  const renderer =
    new THREE.WebGLRenderer({
      antialias: true
    });
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio,
      2
    )
  );
  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type =
    THREE.PCFSoftShadowMap;
  renderer.outputColorSpace =
    THREE.SRGBColorSpace;
  document.body.appendChild(
    renderer.domElement
  );
  /* =========================================================
     LIGHTING
     ========================================================= */
  const hemisphere =
    new THREE.HemisphereLight(
      0x8fd8ff,
      0x05070b,
      1.7
    );
  scene.add(hemisphere);
  const sun =
    new THREE.DirectionalLight(
      0xffffff,
      2.0
    );
  sun.position.set(
    -60,
    90,
    40
  );
  sun.castShadow = true;
  sun.shadow.mapSize.width =
    2048;
  sun.shadow.mapSize.height =
    2048;
  sun.shadow.camera.left =
    -180;
  sun.shadow.camera.right =
    180;
  sun.shadow.camera.top =
    180;
  sun.shadow.camera.bottom =
    -180;
  sun.shadow.camera.near =
    1;
  sun.shadow.camera.far =
    400;
  scene.add(sun);
  /* =========================================================
     TRACK GENERATOR
     ========================================================= */
  const track =
    new TrackGenerator(scene);
  const waypoints =
    track.generate();
  if (
    !waypoints ||
    waypoints.length < 10
  ) {
    console.error(
      "CodeQuestER: Track generation failed."
    );
    return;
  }
  /* =========================================================
     TRACK INFORMATION
     ========================================================= */
  const TRACK_COUNT =
    waypoints.length;
  const ROAD_WIDTH =
    track.laneHalfWidth * 2;
  /* =========================================================
     PLAYER CAR
     ========================================================= */
  const car =
    new THREE.Group();
  car.name =
    "CodeQuestER_Player";
  scene.add(car);
  /* ---------------------------------------------------------
     BODY
     --------------------------------------------------------- */
  const bodyGeometry =
    new THREE.BoxGeometry(
      2.25,
      0.62,
      4.15
    );
  const bodyMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x168cff,
      metalness: 0.65,
      roughness: 0.25
    });
  const body =
    new THREE.Mesh(
      bodyGeometry,
      bodyMaterial
    );
  body.position.y =
    0.65;
  body.castShadow = true;
  car.add(body);
  /* ---------------------------------------------------------
     HOOD
     --------------------------------------------------------- */
  const hoodGeometry =
    new THREE.BoxGeometry(
      2.05,
      0.22,
      1.15
    );
  const hood =
    new THREE.Mesh(
      hoodGeometry,
      bodyMaterial
    );
  hood.position.set(
    0,
    0.96,
    -1.42
  );
  hood.castShadow = true;
  car.add(hood);
  /* ---------------------------------------------------------
     CABIN
     --------------------------------------------------------- */
  const cabinGeometry =
    new THREE.BoxGeometry(
      1.65,
      0.58,
      1.9
    );
  const cabinMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x092c58,
      metalness: 0.35,
      roughness: 0.2,
      transparent: true,
      opacity: 0.88
    });
  const cabin =
    new THREE.Mesh(
      cabinGeometry,
      cabinMaterial
    );
  cabin.position.set(
    0,
    1.13,
    0.05
  );
  cabin.castShadow = true;
  car.add(cabin);
  /* ---------------------------------------------------------
     WHEELS
     --------------------------------------------------------- */
  const wheels = [];
  const frontWheels = [];
  function createWheel(
    x,
    z,
    front
  ) {
    const geometry =
      new THREE.CylinderGeometry(
        0.43,
        0.43,
        0.32,
        18
      );
    const material =
      new THREE.MeshStandardMaterial({
        color: 0x080808,
        roughness: 0.8,
        metalness: 0.1
      });
    const wheel =
      new THREE.Mesh(
        geometry,
        material
      );
    wheel.rotation.z =
      Math.PI / 2;
    wheel.position.set(
      x,
      0.42,
      z
    );
    wheel.castShadow = true;
    car.add(wheel);
    wheels.push(wheel);
    if (front) {
      frontWheels.push(wheel);
    }
    return wheel;
  }
  createWheel(
    -1.08,
    -1.35,
    true
  );
  createWheel(
    1.08,
    -1.35,
    true
  );
  createWheel(
    -1.08,
    1.35,
    false
  );
  createWheel(
    1.08,
    1.35,
    false
  );
  /* =========================================================
     HEADLIGHTS
     ========================================================= */
  function createHeadlight(x) {
    const geometry =
      new THREE.BoxGeometry(
        0.4,
        0.18,
        0.08
      );
    const material =
      new THREE.MeshBasicMaterial({
        color: 0xffffd0
      });
    const light =
      new THREE.Mesh(
        geometry,
        material
      );
    light.position.set(
      x,
      0.73,
      -2.1
    );
    car.add(light);
    const spot =
      new THREE.SpotLight(
        0xffffff,
        2.0,
        35,
        Math.PI / 7,
        0.5,
        1
      );
    spot.position.set(
      x,
      0.85,
      -2
    );
    spot.target.position.set(
      x,
      0,
      -15
    );
    car.add(spot);
    car.add(spot.target);
  }
  createHeadlight(-0.65);
  createHeadlight(0.65);
  /* =========================================================
     REAR LIGHTS
     ========================================================= */
  function createRearLight(x) {
    const geometry =
      new THREE.BoxGeometry(
        0.42,
        0.18,
        0.08
      );
    const material =
      new THREE.MeshBasicMaterial({
        color: 0xff1744
      });
    const light =
      new THREE.Mesh(
        geometry,
        material
      );
    light.position.set(
      x,
      0.72,
      2.08
    );
    car.add(light);
  }
  createRearLight(-0.65);
  createRearLight(0.65);
  /* =========================================================
     CAR START POSITION
     ========================================================= */
  function getDirection(index) {
    const current =
      waypoints[
        index %
        TRACK_COUNT
      ];
    const next =
      waypoints[
        (index + 1) %
        TRACK_COUNT
      ];
    return new THREE.Vector3()
      .subVectors(
        next,
        current
      )
      .normalize();
  }
  const startIndex = 0;
  const startPoint =
    waypoints[startIndex];
  const startDirection =
    getDirection(startIndex);
  car.position.copy(
    startPoint
  );
  car.position.y = 0;
  /*
    The car drives toward local -Z,
    so face -Z along the starting
    track direction.
  */
  car.rotation.y =
    Math.atan2(
      -startDirection.x,
      -startDirection.z
    );
  /* =========================================================
     HUD
     ========================================================= */
  const hud =
    document.createElement("div");
  hud.style.position =
    "fixed";
  hud.style.top =
    "14px";
  hud.style.left =
    "14px";
  hud.style.zIndex =
    "20";
  hud.style.fontFamily =
    "Arial, sans-serif";
  hud.style.color =
    "#ffffff";
  hud.style.background =
    "rgba(0,0,0,.72)";
  hud.style.border =
    "1px solid rgba(0,234,255,.4)";
  hud.style.padding =
    "12px 16px";
  hud.style.borderRadius =
    "8px";
  hud.style.minWidth =
    "190px";
  hud.style.lineHeight =
    "1.45";
  document.body.appendChild(
    hud
  );
  /* =========================================================
     MESSAGE
     ========================================================= */
  const message =
    document.createElement("div");
  message.style.position =
    "fixed";
  message.style.left =
    "50%";
  message.style.top =
    "18%";
  message.style.transform =
    "translate(-50%, -50%)";
  message.style.zIndex =
    "30";
  message.style.color =
    "#ffffff";
  message.style.fontFamily =
    "Arial, sans-serif";
  message.style.fontSize =
    "26px";
  message.style.fontWeight =
    "bold";
  message.style.textAlign =
    "center";
  message.style.textShadow =
    "0 0 12px #00eaff";
  message.style.pointerEvents =
    "none";
  message.style.opacity =
    "0";
  document.body.appendChild(
    message
  );
  let messageTimer = 0;
  function showMessage(text) {
    message.textContent =
      text;
    message.style.opacity =
      "1";
    messageTimer =
      1.8;
  }
  /* =========================================================
     HUD UPDATE
     ========================================================= */
  function updateHUD() {
    const mph =
      Math.round(
        Math.abs(GAME.speed) *
        145
      );
    const boost =
      GAME.boostTimer > 0
        ? "ACTIVE"
        : "READY";
    hud.innerHTML = `
      <strong>CODEQUESTER</strong>
      <br>
      SPEED: ${mph}
      <br>
      LAP: ${GAME.lap}
      <br>
      SCORE: ${GAME.score}
      <br>
      BOOST: ${boost}
      <br>
      TRACK: ${GAME.trackIndex + 1}/${TRACK_COUNT}
      <br>
      DISCOVERED: ${discoveredCount()} / ${LOCATIONS.length}
      <br>
      QUEST: ${questHudText()}
      <br><br>
      W / ↑  ACCELERATE
      <br>
      S / ↓  BRAKE
      <br>
      A / ←  LEFT
      <br>
      D / →  RIGHT
      <br>
      C  CAMERA VIEW
      <br>
      Q E R F  LOOK
    `;
  }
  /* =========================================================
     KEYBOARD
     ========================================================= */
  window.addEventListener(
    "keydown",
    event => {
      const key =
        event.key.toLowerCase();
      if (
        key === "arrowup" ||
        key === "arrowdown" ||
        key === "arrowleft" ||
        key === "arrowright"
      ) {
        event.preventDefault();
      }
      if (
        key === "w" ||
        key === "arrowup"
      ) {
        GAME.keys.forward =
          true;
      }
      if (
        key === "s" ||
        key === "arrowdown"
      ) {
        GAME.keys.backward =
          true;
      }
      if (
        key === "a" ||
        key === "arrowleft"
      ) {
        GAME.keys.left =
          true;
      }
      if (
        key === "d" ||
        key === "arrowright"
      ) {
        GAME.keys.right =
          true;
      }
    }
  );
  window.addEventListener(
    "keyup",
    event => {
      const key =
        event.key.toLowerCase();
      if (
        key === "w" ||
        key === "arrowup"
      ) {
        GAME.keys.forward =
          false;
      }
      if (
        key === "s" ||
        key === "arrowdown"
      ) {
        GAME.keys.backward =
          false;
      }
      if (
        key === "a" ||
        key === "arrowleft"
      ) {
        GAME.keys.left =
          false;
      }
      if (
        key === "d" ||
        key === "arrowright"
      ) {
        GAME.keys.right =
          false;
      }
    }
  );
  /* =========================================================
     MOBILE CONTROLS
     ========================================================= */
  const mobile =
    document.createElement("div");
  mobile.style.position =
    "fixed";
  mobile.style.bottom =
    "20px";
  mobile.style.left =
    "0";
  mobile.style.right =
    "0";
  mobile.style.zIndex =
    "25";
  mobile.style.display =
    "flex";
  mobile.style.justifyContent =
    "space-between";
  mobile.style.padding =
    "0 18px";
  mobile.style.pointerEvents =
    "none";
  document.body.appendChild(
    mobile
  );
  function makeButton(
    label,
    action
  ) {
    const button =
      document.createElement(
        "button"
      );
    button.textContent =
      label;
    button.style.width =
      "72px";
    button.style.height =
      "58px";
    button.style.border =
      "1px solid rgba(0,234,255,.6)";
    button.style.borderRadius =
      "12px";
    button.style.background =
      "rgba(0,0,0,.72)";
    button.style.color =
      "#ffffff";
    button.style.fontSize =
      "18px";
    button.style.fontWeight =
      "bold";
    button.style.touchAction =
      "none";
    button.style.pointerEvents =
      "auto";
    function press(e) {
      e.preventDefault();
      action(true);
    }
    function release(e) {
      e.preventDefault();
      action(false);
    }
    button.addEventListener(
      "pointerdown",
      press
    );
    button.addEventListener(
      "pointerup",
      release
    );
    button.addEventListener(
      "pointercancel",
      release
    );
    button.addEventListener(
      "pointerleave",
      release
    );
    return button;
  }
  const leftButton =
    makeButton(
      "LEFT",
      value => {
        GAME.keys.left =
          value;
      }
    );
  const rightButton =
    makeButton(
      "RIGHT",
      value => {
        GAME.keys.right =
          value;
      }
    );
  const controlsLeft =
    document.createElement(
      "div"
    );
  controlsLeft.style.display =
    "flex";
  controlsLeft.style.gap =
    "8px";
  controlsLeft.appendChild(
    leftButton
  );
  controlsLeft.appendChild(
    rightButton
  );
  const controlsRight =
    document.createElement(
      "div"
    );
  controlsRight.style.display =
    "flex";
  controlsRight.style.gap =
    "8px";
  const brakeButton =
    makeButton(
      "BRAKE",
      value => {
        GAME.keys.backward =
          value;
      }
    );
  const gasButton =
    makeButton(
      "GAS",
      value => {
        GAME.keys.forward =
          value;
      }
    );
  controlsRight.appendChild(
    brakeButton
  );
  controlsRight.appendChild(
    gasButton
  );
  mobile.appendChild(
    controlsLeft
  );
  mobile.appendChild(
    controlsRight
  );
  /* =========================================================
     STEP 3 — FREE-LOOK CAMERA
     DRIVE = the existing follow camera (default).
     LOOK  = same follow camera, but the player can look
             around independently. The car is never rotated
             and keeps its normal physics; the camera is an
             observation system only.
     ========================================================= */
  const LOOK = {
    mode: "DRIVE",
    /* radians. +yaw looks left, +pitch looks up */
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
    keys: {
      left: false,
      right: false,
      up: false,
      down: false
    },
    dragPointer: null,
    lastX: 0,
    lastY: 0
  };
  function wrapAngle(angle) {
    return Math.atan2(
      Math.sin(angle),
      Math.cos(angle)
    );
  }
  /* ---------------------------------------------------------
     CAMERA VIEW BUTTON + MODE INDICATOR
     (top-right, clear of the HUD and the driving buttons)
     --------------------------------------------------------- */
  const cameraPanel =
    document.createElement("div");
  cameraPanel.style.position =
    "fixed";
  cameraPanel.style.top =
    "14px";
  cameraPanel.style.right =
    "10px";
  cameraPanel.style.width =
    "112px";
  cameraPanel.style.boxSizing =
    "border-box";
  cameraPanel.style.zIndex =
    "26";
  cameraPanel.style.fontFamily =
    "Arial, sans-serif";
  cameraPanel.style.color =
    "#ffffff";
  cameraPanel.style.textAlign =
    "center";
  cameraPanel.style.pointerEvents =
    "none";
  document.body.appendChild(
    cameraPanel
  );
  const cameraButton =
    document.createElement("button");
  cameraButton.type =
    "button";
  cameraButton.textContent =
    "CAMERA VIEW";
  cameraButton.style.width =
    "100%";
  cameraButton.style.height =
    "40px";
  cameraButton.style.borderRadius =
    "10px";
  cameraButton.style.fontSize =
    "12px";
  cameraButton.style.fontWeight =
    "bold";
  cameraButton.style.letterSpacing =
    "0.5px";
  cameraButton.style.cursor =
    "pointer";
  cameraButton.style.touchAction =
    "manipulation";
  cameraButton.style.pointerEvents =
    "auto";
  cameraPanel.appendChild(
    cameraButton
  );
  const cameraStatus =
    document.createElement("div");
  cameraStatus.style.marginTop =
    "6px";
  cameraStatus.style.padding =
    "4px 6px";
  cameraStatus.style.fontSize =
    "11px";
  cameraStatus.style.lineHeight =
    "1.35";
  cameraStatus.style.background =
    "rgba(0,0,0,.55)";
  cameraStatus.style.borderRadius =
    "6px";
  cameraPanel.appendChild(
    cameraStatus
  );
  /* objective readout: nearest / quest location + distance */
  const objectivePanel =
    document.createElement("div");
  objectivePanel.style.marginTop =
    "6px";
  objectivePanel.style.padding =
    "5px 6px";
  objectivePanel.style.fontSize =
    "12px";
  objectivePanel.style.fontWeight =
    "bold";
  objectivePanel.style.lineHeight =
    "1.35";
  objectivePanel.style.background =
    "rgba(0,0,0,.55)";
  objectivePanel.style.border =
    "1px solid rgba(0,234,255,.35)";
  objectivePanel.style.borderRadius =
    "6px";
  objectivePanel.style.display =
    "none";
  cameraPanel.appendChild(
    objectivePanel
  );
  let cameraStatusHTML = "";
  function updateCameraPanel() {
    const looking =
      LOOK.mode === "LOOK";
    const html =
      looking
        ? "CAMERA: LOOK" +
          "<br><strong style=\"color:#22ff66\">LOOK AROUND</strong>" +
          "<br>DRAG TO LOOK"
        : "CAMERA: DRIVE";
    if (html !== cameraStatusHTML) {
      cameraStatusHTML = html;
      cameraStatus.innerHTML = html;
    }
    cameraButton.style.border =
      looking
        ? "1px solid #22ff66"
        : "1px solid rgba(0,234,255,.6)";
    cameraButton.style.background =
      looking
        ? "rgba(0,60,30,.85)"
        : "rgba(0,0,0,.72)";
    cameraButton.style.color =
      looking
        ? "#22ff66"
        : "#ffffff";
    cameraButton.setAttribute(
      "aria-pressed",
      looking ? "true" : "false"
    );
    renderer.domElement.style.cursor =
      looking ? "grab" : "default";
  }
  function setCameraMode(mode) {
    if (LOOK.mode === mode) {
      return;
    }
    LOOK.mode = mode;
    LOOK.dragPointer = null;
    LOOK.keys.left = false;
    LOOK.keys.right = false;
    LOOK.keys.up = false;
    LOOK.keys.down = false;
    if (mode === "DRIVE") {
      /*
        Go home the short way round, then let
        updateLook() ease the offsets back to 0
        instead of snapping.
      */
      const wrapped =
        wrapAngle(LOOK.yaw);
      LOOK.yaw = wrapped;
      LOOK.targetYaw = 0;
      LOOK.targetPitch = 0;
    }
    updateCameraPanel();
  }
  function toggleCameraMode() {
    setCameraMode(
      LOOK.mode === "DRIVE"
        ? "LOOK"
        : "DRIVE"
    );
  }
  cameraButton.addEventListener(
    "click",
    () => {
      toggleCameraMode();
      cameraButton.blur();
    }
  );
  /* ---------------------------------------------------------
     DRAG / SWIPE TO LOOK (mouse, touch and pen)
     Listens on the game canvas only, so the driving buttons
     keep working and a second finger can still steer.
     --------------------------------------------------------- */
  const lookSurface =
    renderer.domElement;
  lookSurface.style.touchAction =
    "none";
  lookSurface.addEventListener(
    "contextmenu",
    event => {
      event.preventDefault();
    }
  );
  lookSurface.addEventListener(
    "pointerdown",
    event => {
      if (LOOK.mode !== "LOOK") {
        return;
      }
      if (LOOK.dragPointer !== null) {
        return;
      }
      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }
      LOOK.dragPointer =
        event.pointerId;
      LOOK.lastX =
        event.clientX;
      LOOK.lastY =
        event.clientY;
      try {
        lookSurface.setPointerCapture(
          event.pointerId
        );
      } catch (error) {
        /* capture is optional */
      }
      lookSurface.style.cursor =
        "grabbing";
      event.preventDefault();
    }
  );
  lookSurface.addEventListener(
    "pointermove",
    event => {
      if (
        LOOK.mode !== "LOOK" ||
        event.pointerId !==
          LOOK.dragPointer
      ) {
        return;
      }
      const dx =
        event.clientX - LOOK.lastX;
      const dy =
        event.clientY - LOOK.lastY;
      LOOK.lastX =
        event.clientX;
      LOOK.lastY =
        event.clientY;
      /*
        drag left  -> look left   (+yaw)
        drag right -> look right  (-yaw)
        drag up    -> look up     (+pitch)
        drag down  -> look down   (-pitch)
      */
      LOOK.targetYaw -=
        dx * LOOK.dragYawPerPixel;
      LOOK.targetPitch -=
        dy * LOOK.dragPitchPerPixel;
      LOOK.targetPitch =
        THREE.MathUtils.clamp(
          LOOK.targetPitch,
          -LOOK.maxPitch,
          LOOK.maxPitch
        );
      event.preventDefault();
    }
  );
  function endLookDrag(event) {
    if (
      event.pointerId !==
      LOOK.dragPointer
    ) {
      return;
    }
    LOOK.dragPointer = null;
    lookSurface.style.cursor =
      LOOK.mode === "LOOK"
        ? "grab"
        : "default";
  }
  lookSurface.addEventListener(
    "pointerup",
    endLookDrag
  );
  lookSurface.addEventListener(
    "pointercancel",
    endLookDrag
  );
  /* ---------------------------------------------------------
     KEYBOARD: C toggles, Q/E/R/F look (hold).
     Separate from the driving key handlers above.
     --------------------------------------------------------- */
  window.addEventListener(
    "keydown",
    event => {
      /* leave browser shortcuts (Ctrl+R, Ctrl+F ...) alone */
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const key =
        event.key.toLowerCase();
      if (key === "c") {
        if (!event.repeat) {
          toggleCameraMode();
        }
        return;
      }
      if (key === "q") {
        LOOK.keys.left = true;
      }
      if (key === "e") {
        LOOK.keys.right = true;
      }
      if (key === "r") {
        LOOK.keys.up = true;
      }
      if (key === "f") {
        LOOK.keys.down = true;
      }
    }
  );
  window.addEventListener(
    "keyup",
    event => {
      const key =
        event.key.toLowerCase();
      if (key === "q") {
        LOOK.keys.left = false;
      }
      if (key === "e") {
        LOOK.keys.right = false;
      }
      if (key === "r") {
        LOOK.keys.up = false;
      }
      if (key === "f") {
        LOOK.keys.down = false;
      }
    }
  );
  window.addEventListener(
    "blur",
    () => {
      LOOK.keys.left = false;
      LOOK.keys.right = false;
      LOOK.keys.up = false;
      LOOK.keys.down = false;
      LOOK.dragPointer = null;
    }
  );
  /* ---------------------------------------------------------
     LOOK UPDATE (called every frame)
     --------------------------------------------------------- */
  function updateLook(delta) {
    if (LOOK.mode === "LOOK") {
      if (LOOK.keys.left) {
        LOOK.targetYaw +=
          LOOK.keyYawSpeed * delta;
      }
      if (LOOK.keys.right) {
        LOOK.targetYaw -=
          LOOK.keyYawSpeed * delta;
      }
      if (LOOK.keys.up) {
        LOOK.targetPitch +=
          LOOK.keyPitchSpeed * delta;
      }
      if (LOOK.keys.down) {
        LOOK.targetPitch -=
          LOOK.keyPitchSpeed * delta;
      }
      LOOK.targetPitch =
        THREE.MathUtils.clamp(
          LOOK.targetPitch,
          -LOOK.maxPitch,
          LOOK.maxPitch
        );
      /* horizontal look is free, but keep numbers small */
      if (
        Math.abs(LOOK.targetYaw) >
        Math.PI * 4
      ) {
        const shift =
          Math.round(
            LOOK.targetYaw /
            (Math.PI * 2)
          ) *
          Math.PI * 2;
        LOOK.targetYaw -= shift;
        LOOK.yaw -= shift;
      }
    }
    const returning =
      LOOK.mode === "DRIVE";
    const rate =
      returning
        ? LOOK.returnRate
        : LOOK.followRate;
    const blend =
      1 - Math.exp(-rate * delta);
    let stepYaw =
      (LOOK.targetYaw - LOOK.yaw) *
      blend;
    let stepPitch =
      (LOOK.targetPitch - LOOK.pitch) *
      blend;
    if (returning) {
      /*
        Ease home at a limited angular speed so
        a big look angle never whips back.
      */
      const maxStep =
        LOOK.maxReturnSpeed * delta;
      stepYaw =
        THREE.MathUtils.clamp(
          stepYaw,
          -maxStep,
          maxStep
        );
      stepPitch =
        THREE.MathUtils.clamp(
          stepPitch,
          -maxStep,
          maxStep
        );
    }
    LOOK.yaw += stepYaw;
    LOOK.pitch += stepPitch;
    LOOK.pitch =
      THREE.MathUtils.clamp(
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
     STEP 4 — CITY DISCOVERY
     Locations sit on EXISTING city buildings from the
     generator (track.destinations), so no new buildings are
     created. Each gets one cheap glowing beacon so it can be
     spotted from far away.
     NOTE: the names below are only attached to those buildings
     here — change the table to re-map them.
     ========================================================= */
  const LOCATION_DEFS = [
    {
      id: "tech_hub",
      name: "TECH HUB",
      type: "quest",
      buildingType: "radio_station"
    },
    {
      id: "garage",
      name: "GARAGE",
      type: "garage",
      buildingType: "auto_shop"
    },
    {
      id: "studio",
      name: "STUDIO",
      type: "studio",
      buildingType: "record_store"
    },
    {
      id: "shop",
      name: "SHOP",
      type: "shop",
      buildingType: "clothing_store"
    },
    {
      id: "office",
      name: "OFFICE",
      type: "office",
      buildingType: "bank"
    }
  ];
  const DISCOVERY = {
    /* metres from the building footprint */
    arriveRadius: 45,
    discoverRadius: 18,
    questTargetId: "tech_hub",
    /* "none" -> "active" -> "complete" */
    questState: "none",
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
  LOCATION_DEFS.forEach(
    definition => {
      const building =
        (track.destinations || [])
          .find(
            candidate =>
              candidate.userData &&
              candidate.userData
                .buildingType ===
                definition.buildingType
          );
      if (
        !building ||
        !building.geometry ||
        !building.geometry.parameters
      ) {
        console.warn(
          "CodeQuestER: no building for location " +
          definition.id
        );
        return;
      }
      const size =
        building.geometry.parameters;
      const beacon =
        new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.7,
            0.7,
            DISCOVERY.beaconHeight,
            8,
            1,
            true
          ),
          new THREE.MeshBasicMaterial({
            color:
              BEACON_COLORS
                .undiscovered,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
            fog: false
          })
        );
      beacon.position.set(
        building.position.x,
        size.height +
          DISCOVERY.beaconHeight / 2,
        building.position.z
      );
      beacon.name =
        "LocationBeacon_" +
        definition.id;
      beacon.userData = {
        type: "locationBeacon",
        locationId: definition.id
      };
      scene.add(beacon);
      LOCATIONS.push({
        id: definition.id,
        name: definition.name,
        type: definition.type,
        position:
          new THREE.Vector3(
            building.position.x,
            0,
            building.position.z
          ),
        halfWidth:
          size.width / 2,
        halfDepth:
          size.depth / 2,
        discovered: false,
        beacon
      });
    }
  );
  /* ---------------------------------------------------------
     HELPERS (also used by the HUD)
     --------------------------------------------------------- */
  function discoveredCount() {
    let count = 0;
    for (
      let i = 0;
      i < LOCATIONS.length;
      i++
    ) {
      if (LOCATIONS[i].discovered) {
        count++;
      }
    }
    return count;
  }
  function findLocation(id) {
    for (
      let i = 0;
      i < LOCATIONS.length;
      i++
    ) {
      if (LOCATIONS[i].id === id) {
        return LOCATIONS[i];
      }
    }
    return null;
  }
  function questHudText() {
    if (
      DISCOVERY.questState ===
      "active"
    ) {
      return "FIND TECH HUB";
    }
    if (
      DISCOVERY.questState ===
      "complete"
    ) {
      return "COMPLETE";
    }
    return "NONE";
  }
  /*
    Distance from the car to the edge of the
    building footprint (0 when inside it).
  */
  function distanceToLocation(
    location
  ) {
    const dx =
      Math.max(
        Math.abs(
          car.position.x -
          location.position.x
        ) - location.halfWidth,
        0
      );
    const dz =
      Math.max(
        Math.abs(
          car.position.z -
          location.position.z
        ) - location.halfDepth,
        0
      );
    return Math.sqrt(
      dx * dx + dz * dz
    );
  }
  /* ---------------------------------------------------------
     BANNER (queued, so back-to-back messages never overwrite
     each other or the existing boost / jump messages)
     --------------------------------------------------------- */
  const banner =
    document.createElement("div");
  banner.style.position =
    "fixed";
  banner.style.left =
    "50%";
  banner.style.top =
    "30%";
  banner.style.transform =
    "translate(-50%, -50%)";
  banner.style.zIndex =
    "31";
  banner.style.fontFamily =
    "Arial, sans-serif";
  banner.style.color =
    "#ffffff";
  banner.style.textAlign =
    "center";
  banner.style.textShadow =
    "0 0 14px #00eaff";
  banner.style.pointerEvents =
    "none";
  banner.style.opacity =
    "0";
  banner.style.transition =
    "opacity 0.25s";
  const bannerHead =
    document.createElement("div");
  bannerHead.style.fontSize =
    "14px";
  bannerHead.style.letterSpacing =
    "3px";
  bannerHead.style.color =
    "#00eaff";
  const bannerBody =
    document.createElement("div");
  bannerBody.style.fontSize =
    "24px";
  bannerBody.style.fontWeight =
    "bold";
  banner.appendChild(bannerHead);
  banner.appendChild(bannerBody);
  document.body.appendChild(
    banner
  );
  function enqueueBanner(
    head,
    body,
    seconds
  ) {
    DISCOVERY.queue.push({
      head,
      body,
      seconds
    });
  }
  function updateBanner(delta) {
    if (DISCOVERY.bannerTimer > 0) {
      DISCOVERY.bannerTimer -=
        delta;
      if (
        DISCOVERY.bannerTimer <= 0
      ) {
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
      const next =
        DISCOVERY.queue.shift();
      bannerHead.textContent =
        next.head;
      bannerBody.textContent =
        next.body;
      banner.style.opacity = "1";
      DISCOVERY.bannerTimer =
        next.seconds;
    }
  }
  /* ---------------------------------------------------------
     DISCOVERY + QUEST HOOK
     DRIVE -> DISCOVER -> QUEST -> COMPLETE
     --------------------------------------------------------- */
  function refreshBeaconColors() {
    for (
      let i = 0;
      i < LOCATIONS.length;
      i++
    ) {
      const location =
        LOCATIONS[i];
      let color =
        BEACON_COLORS.undiscovered;
      if (location.discovered) {
        color =
          BEACON_COLORS.discovered;
      } else if (
        DISCOVERY.questState ===
          "active" &&
        location.id ===
          DISCOVERY.questTargetId
      ) {
        color =
          BEACON_COLORS.quest;
      }
      location.beacon.material
        .color.setHex(color);
    }
  }
  function completeQuest() {
    DISCOVERY.questState =
      "complete";
    enqueueBanner(
      "QUEST COMPLETE",
      "TECH HUB DISCOVERED",
      3
    );
  }
  function discoverLocation(
    location
  ) {
    location.discovered = true;
    enqueueBanner(
      "LOCATION DISCOVERED",
      location.name,
      2.4
    );
    const questTarget =
      findLocation(
        DISCOVERY.questTargetId
      );
    if (questTarget) {
      if (
        DISCOVERY.questState ===
        "none"
      ) {
        if (
          location === questTarget
        ) {
          /* first find happens to be the Tech Hub */
          completeQuest();
        } else {
          DISCOVERY.questState =
            "active";
          enqueueBanner(
            "NEW QUEST",
            "Find the Tech Hub.",
            3
          );
        }
      } else if (
        DISCOVERY.questState ===
          "active" &&
        location === questTarget
      ) {
        completeQuest();
      }
    }
    if (
      discoveredCount() ===
      LOCATIONS.length
    ) {
      enqueueBanner(
        "CITY DISCOVERY",
        "ALL LOCATIONS DISCOVERED",
        3
      );
    }
    refreshBeaconColors();
  }
  let objectiveHTML = "";
  function setObjective(html) {
    if (html === objectiveHTML) {
      return;
    }
    objectiveHTML = html;
    objectivePanel.innerHTML =
      html;
    objectivePanel.style.display =
      html ? "block" : "none";
  }
  function updateDiscovery(delta) {
    DISCOVERY.time += delta;
    /* gentle beacon pulse (undiscovered only) */
    const pulse =
      0.45 +
      0.2 *
        Math.sin(
          DISCOVERY.time * 3
        );
    let nearest = null;
    let nearestDistance =
      Infinity;
    for (
      let i = 0;
      i < LOCATIONS.length;
      i++
    ) {
      const location =
        LOCATIONS[i];
      if (location.discovered) {
        location.beacon.material
          .opacity = 0.3;
        continue;
      }
      location.beacon.material
        .opacity = pulse;
      const distance =
        distanceToLocation(
          location
        );
      if (
        distance <=
        DISCOVERY.discoverRadius
      ) {
        discoverLocation(location);
        continue;
      }
      if (
        distance < nearestDistance
      ) {
        nearestDistance = distance;
        nearest = location;
      }
    }
    /*
      Objective readout: the quest target while
      the quest is active, otherwise the nearest
      undiscovered location.
    */
    let target = nearest;
    if (
      DISCOVERY.questState ===
      "active"
    ) {
      const questTarget =
        findLocation(
          DISCOVERY.questTargetId
        );
      if (
        questTarget &&
        !questTarget.discovered
      ) {
        target = questTarget;
      }
    }
    if (
      target &&
      !target.discovered
    ) {
      const distance =
        distanceToLocation(target);
      const text =
        distance <=
        DISCOVERY.arriveRadius
          ? "ARRIVING"
          : Math.round(distance) +
            "m";
      setObjective(
        target.name +
        "<br>" +
        text
      );
    } else {
      setObjective("");
    }
    updateBanner(delta);
  }
  refreshBeaconColors();
  /* =========================================================
     FIND CLOSEST TRACK POINT
     =========================================================
     IMPORTANT:
     This no longer controls the car's
     physical position.
     It is informational only.
     The player is free to leave
     the road and explore the world.
     ========================================================= */
  function findClosestWaypoint() {
    let closest =
      GAME.trackIndex;
    let closestDistance =
      Infinity;
    /*
      Search locally rather than
      checking every waypoint
      every frame.
    */
    const searchRadius = 35;
    for (
      let offset = -searchRadius;
      offset <= searchRadius;
      offset++
    ) {
      const index =
        (
          GAME.trackIndex +
          offset +
          TRACK_COUNT
        ) %
        TRACK_COUNT;
      const point =
        waypoints[index];
      const dx =
        car.position.x -
        point.x;
      const dz =
        car.position.z -
        point.z;
      const distance =
        dx * dx +
        dz * dz;
      if (
        distance <
        closestDistance
      ) {
        closestDistance =
          distance;
        closest =
          index;
      }
    }
    GAME.trackIndex =
      closest;
  }
  /* =========================================================
     STEERING
     ========================================================= */
  function updateSteering() {
    let input = 0;
    if (GAME.keys.left) {
      input -= 1;
    }
    if (GAME.keys.right) {
      input += 1;
    }
    GAME.steeringTarget =
      input;
    GAME.steering =
      THREE.MathUtils.lerp(
        GAME.steering,
        GAME.steeringTarget,
        0.14
      );
    /*
      Steering gets slightly
      stronger at higher speed.
    */
    const speedFactor =
      THREE.MathUtils.clamp(
        Math.abs(GAME.speed) /
          GAME.maxSpeed,
        0.25,
        1
      );
    const steeringAmount =
      GAME.steering *
      GAME.steeringPower *
      speedFactor;
    /*
      Rotate the vehicle around
      its own vertical axis.
    */
    car.rotation.y +=
      steeringAmount;
    /*
      Front wheel visual steering.
    */
    frontWheels.forEach(
      wheel => {
        wheel.rotation.y =
          GAME.steering *
          0.45;
      }
    );
  }
  /* =========================================================
     CAR MOVEMENT
     ========================================================= */
  function updateCar(delta) {
    /* -------------------------------------------------------
       ACCELERATION
       ------------------------------------------------------- */
    if (GAME.keys.forward) {
      GAME.speed +=
        GAME.acceleration;
    }
    /* -------------------------------------------------------
       BRAKING / REVERSE
       ------------------------------------------------------- */
    if (GAME.keys.backward) {
      if (GAME.speed > 0) {
        GAME.speed -=
          GAME.braking;
      } else {
        GAME.speed -=
          GAME.acceleration *
          0.6;
      }
    }
    /* -------------------------------------------------------
       FRICTION
       ------------------------------------------------------- */
    if (
      !GAME.keys.forward &&
      !GAME.keys.backward
    ) {
      if (GAME.speed > 0) {
        GAME.speed =
          Math.max(
            0,
            GAME.speed -
              GAME.friction
          );
      } else if (
        GAME.speed < 0
      ) {
        GAME.speed =
          Math.min(
            0,
            GAME.speed +
              GAME.friction
          );
      }
    }
    /* -------------------------------------------------------
       BOOST
       ------------------------------------------------------- */
    if (
      GAME.boostTimer > 0
    ) {
      GAME.boostTimer -=
        delta;
      GAME.boostPower =
        1.45;
    } else {
      GAME.boostPower =
        1;
    }
    GAME.speed =
      THREE.MathUtils.clamp(
        GAME.speed,
        -GAME.reverseSpeed,
        GAME.maxSpeed *
          GAME.boostPower
      );
    updateSteering();
    /* -------------------------------------------------------
       MOVE CAR
       -------------------------------------------------------
       FREE DRIVING ENABLED.
       There is intentionally NO code here
       that pulls the vehicle back toward
       the generated road.
       The car can now travel anywhere
       on the generated world floor.
       ------------------------------------------------------- */
    const forward =
      new THREE.Vector3(
        0,
        0,
        -1
      );
    forward.applyQuaternion(
      car.quaternion
    );
    car.position.addScaledVector(
      forward,
      GAME.speed
    );
    /* -------------------------------------------------------
       WHEEL ROTATION
       ------------------------------------------------------- */
    wheels.forEach(
      wheel => {
        wheel.rotation.x -=
          GAME.speed * 2.2;
      }
    );
    /* -------------------------------------------------------
       DISTANCE
       ------------------------------------------------------- */
    GAME.distance +=
      Math.abs(
        GAME.speed
      );
    /* -------------------------------------------------------
       TRACK POSITION
       -------------------------------------------------------
       Informational only.
       This does NOT restrict movement.
       ------------------------------------------------------- */
    findClosestWaypoint();
  }
  /* =========================================================
     ZONE DETECTION
     ========================================================= */
  function checkInteractiveObjects() {
    const carXZ =
      new THREE.Vector2(
        car.position.x,
        car.position.z
      );
    track.zones.forEach(
      object => {
        if (
          !object.userData ||
          !object.userData.active
        ) {
          return;
        }
        const distance =
          carXZ.distanceTo(
            new THREE.Vector2(
              object.position.x,
              object.position.z
            )
          );
        if (
          distance >
          ROAD_WIDTH * 0.65
        ) {
          return;
        }
        /* ---------------------------------------------------
           COLOR ZONE
           --------------------------------------------------- */
        if (
          object.userData.type ===
          "colorZone"
        ) {
          applyColorBoost(
            object
          );
          object.userData.active =
            false;
        }
        /* ---------------------------------------------------
           SPEED BOOST
           --------------------------------------------------- */
        if (
          object.userData.type ===
          "speedBoost"
        ) {
          GAME.boostTimer =
            3.0;
          GAME.score +=
            50;
          showMessage(
            "SPEED BOOST"
          );
          object.userData.active =
            false;
          object.scale.y =
            0.35;
        }
      }
    );
    /* -------------------------------------------------------
       RAMPS
       ------------------------------------------------------- */
    track.ramps.forEach(
      ramp => {
        const distance =
          carXZ.distanceTo(
            new THREE.Vector2(
              ramp.position.x,
              ramp.position.z
            )
          );
        if (
          distance < 4 &&
          !GAME.airborne &&
          Math.abs(
            GAME.speed
          ) > 0.25
        ) {
          jumpCar();
        }
      }
    );
  }
  /* =========================================================
     COLOR BOOST
     Translation of ColorZone.cs behavior
     ========================================================= */
  function applyColorBoost(
    zone
  ) {
    const color =
      zone.userData.color;
    switch (color) {
      case "RED":
        GAME.maxSpeed =
          Math.min(
            GAME.maxSpeed +
              0.08,
            1.05
          );
        GAME.score +=
          100;
        showMessage(
          "RED BOOST"
        );
        break;
      case "GREEN":
        GAME.acceleration =
          Math.min(
            GAME.acceleration +
              0.002,
            0.028
          );
        GAME.score +=
          100;
        showMessage(
          "GREEN BOOST"
        );
        break;
      case "BLUE":
        GAME.steeringPower =
          Math.min(
            GAME.steeringPower +
              0.004,
            0.055
          );
        GAME.score +=
          100;
        showMessage(
          "BLUE BOOST"
        );
        break;
    }
    /*
      Flash the car with
      the zone color.
    */
    const original =
      bodyMaterial.color.getHex();
    bodyMaterial.color.setHex(
      zone.userData.boostColor
    );
    setTimeout(
      () => {
        bodyMaterial.color.setHex(
          original
        );
      },
      450
    );
  }
  /* =========================================================
     JUMP SYSTEM
     ========================================================= */
  function jumpCar() {
    GAME.airborne =
      true;
    GAME.jumpVelocity =
      0.26;
    GAME.score +=
      75;
    showMessage(
      "JUMP!"
    );
  }
  function updateJump() {
    if (!GAME.airborne) {
      return;
    }
    car.position.y +=
      GAME.jumpVelocity;
    GAME.jumpVelocity -=
      0.018;
    if (
      car.position.y <= 0
    ) {
      car.position.y =
        0;
      GAME.airborne =
        false;
      GAME.jumpVelocity =
        0;
    }
  }
  /* =========================================================
     LAP DETECTION
     ========================================================= */
  function updateLap() {
    const current =
      GAME.trackIndex;
    /*
      Detect crossing from the
      end of the waypoint array
      back to the beginning.
      NOTE:
      Because free driving is now
      enabled, lap detection is only
      meaningful when the player is
      actually driving around the track.
    */
    if (
      GAME.lastTrackIndex >
        TRACK_COUNT * 0.8 &&
      current <
        TRACK_COUNT * 0.2
    ) {
      GAME.lap++;
      GAME.score +=
        500;
      showMessage(
        "LAP COMPLETE"
      );
    }
    GAME.lastTrackIndex =
      current;
  }
  /* =========================================================
     CAMERA
     ========================================================= */
  const cameraPosition =
    new THREE.Vector3();
  const cameraTarget =
    new THREE.Vector3();
  /*
    FREE-LOOK: rotate the existing driving view
    by the player's look yaw / pitch. In DRIVE
    mode both offsets settle at 0, so the normal
    driving camera is unchanged.
  */
  function applyLookOffset() {
    if (
      Math.abs(LOOK.yaw) < 0.0001 &&
      Math.abs(LOOK.pitch) < 0.0001
    ) {
      return;
    }
    const dx =
      cameraTarget.x -
      camera.position.x;
    const dy =
      cameraTarget.y -
      camera.position.y;
    const dz =
      cameraTarget.z -
      camera.position.z;
    const length =
      Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
      ) || 1;
    /*
      Yaw 0 = looking along -Z, positive yaw
      turns toward -X (the player's left).
    */
    const baseYaw =
      Math.atan2(-dx, -dz);
    const basePitch =
      Math.asin(
        THREE.MathUtils.clamp(
          dy / length,
          -1,
          1
        )
      );
    const yaw =
      baseYaw + LOOK.yaw;
    /*
      Never reach straight up / down, so the
      camera cannot flip upside down.
    */
    const pitch =
      THREE.MathUtils.clamp(
        basePitch + LOOK.pitch,
        -1.4,
        1.4
      );
    const flat =
      Math.cos(pitch);
    cameraTarget.set(
      camera.position.x -
        Math.sin(yaw) * flat * length,
      camera.position.y +
        Math.sin(pitch) * length,
      camera.position.z -
        Math.cos(yaw) * flat * length
    );
  }
  function updateCamera() {
    const forward =
      new THREE.Vector3(
        0,
        0,
        -1
      );
    forward.applyQuaternion(
      car.quaternion
    );
    cameraPosition.copy(
      car.position
    );
    cameraPosition.addScaledVector(
      forward,
      -10
    );
    cameraPosition.y +=
      5.5;
    camera.position.lerp(
      cameraPosition,
      0.08
    );
    cameraTarget.copy(
      car.position
    );
    cameraTarget.addScaledVector(
      forward,
      8
    );
    cameraTarget.y +=
      1;
    applyLookOffset();
    camera.lookAt(
      cameraTarget
    );
  }
  /* =========================================================
     MESSAGE TIMER
     ========================================================= */
  function updateMessage(
    delta
  ) {
    if (
      messageTimer > 0
    ) {
      messageTimer -=
        delta;
      if (
        messageTimer <= 0
      ) {
        message.style.opacity =
          "0";
      }
    }
  }
  /* =========================================================
     RESIZE
     ========================================================= */
  window.addEventListener(
    "resize",
    () => {
      camera.aspect =
        window.innerWidth /
        window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        window.innerWidth,
        window.innerHeight
      );
    }
  );
  /* =========================================================
     START MESSAGE
     ========================================================= */
  showMessage(
    "CODEQUESTER"
  );
  /* =========================================================
     GAME LOOP
     ========================================================= */
  const clock =
    new THREE.Clock();
  function animate() {
    requestAnimationFrame(
      animate
    );
    const delta =
      Math.min(
        clock.getDelta(),
        0.05
      );
    updateCar(delta);
    updateJump();
    checkInteractiveObjects();
    updateLap();
    updateDiscovery(delta);
    updateLook(delta);
    updateCamera();
    updateMessage(delta);
    updateHUD();
    renderer.render(
      scene,
      camera
    );
  }
  updateHUD();
  animate();
})();
