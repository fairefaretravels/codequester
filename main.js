/* =========================================================
   CODEQUESTER — THREE.JS 3D GAME
   Browser-based driving / quest prototype
   Three.js r156
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     GAME STATE
     ========================================================= */

  const GAME = {
    speed: 0,
    maxSpeed: 0.65,
    acceleration: 0.012,
    braking: 0.035,
    friction: 0.008,
    steering: 0,
    steeringPower: 0.035,

    distance: 0,
    quest: 1,
    score: 0,

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

  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x07111c);

  scene.fog = new THREE.Fog(
    0x07111c,
    45,
    220
  );

  /* =========================================================
     CAMERA
     ========================================================= */

  const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  camera.position.set(
    0,
    5,
    10
  );

  /* =========================================================
     RENDERER
     ========================================================= */

  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
  );

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  /* =========================================================
     LIGHTING
     ========================================================= */

  const ambientLight = new THREE.HemisphereLight(
    0x9ecbff,
    0x162016,
    1.6
  );

  scene.add(ambientLight);

  const sun = new THREE.DirectionalLight(
    0xffffff,
    2
  );

  sun.position.set(
    -40,
    60,
    30
  );

  sun.castShadow = true;

  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;

  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;

  scene.add(sun);

  /* =========================================================
     WORLD
     ========================================================= */

  const world = new THREE.Group();

  scene.add(world);

  /* =========================================================
     GROUND
     ========================================================= */

  const groundGeometry =
    new THREE.PlaneGeometry(
      500,
      500
    );

  const groundMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x263026,
      roughness: 1
    });

  const ground =
    new THREE.Mesh(
      groundGeometry,
      groundMaterial
    );

  ground.rotation.x = -Math.PI / 2;

  ground.receiveShadow = true;

  world.add(ground);

  /* =========================================================
     ROAD
     ========================================================= */

  const ROAD_WIDTH = 12;
  const ROAD_LENGTH = 500;

  const roadGeometry =
    new THREE.PlaneGeometry(
      ROAD_WIDTH,
      ROAD_LENGTH
    );

  const roadMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x20242a,
      roughness: 0.9
    });

  const road =
    new THREE.Mesh(
      roadGeometry,
      roadMaterial
    );

  road.rotation.x = -Math.PI / 2;

  road.position.y = 0.02;

  world.add(road);

  /* =========================================================
     ROAD MARKINGS
     ========================================================= */

  const roadMarks =
    new THREE.Group();

  world.add(roadMarks);

  for (
    let z = -240;
    z < 250;
    z += 12
  ) {

    const geometry =
      new THREE.BoxGeometry(
        0.25,
        0.03,
        6
      );

    const material =
      new THREE.MeshBasicMaterial({
        color: 0xffffff
      });

    const mark =
      new THREE.Mesh(
        geometry,
        material
      );

    mark.position.set(
      0,
      0.05,
      z
    );

    roadMarks.add(mark);
  }

  /* =========================================================
     SIDE LINES
     ========================================================= */

  function createRoadLine(x) {

    const geometry =
      new THREE.BoxGeometry(
        0.18,
        0.04,
        ROAD_LENGTH
      );

    const material =
      new THREE.MeshBasicMaterial({
        color: 0xf5f5f5
      });

    const line =
      new THREE.Mesh(
        geometry,
        material
      );

    line.position.set(
      x,
      0.05,
      0
    );

    world.add(line);
  }

  createRoadLine(
    -ROAD_WIDTH / 2 + 0.3
  );

  createRoadLine(
    ROAD_WIDTH / 2 - 0.3
  );

  /* =========================================================
     TREES
     ========================================================= */

  const trees =
    new THREE.Group();

  world.add(trees);

  function createTree(x, z) {

    const tree =
      new THREE.Group();

    /* trunk */

    const trunkGeometry =
      new THREE.CylinderGeometry(
        0.25,
        0.35,
        2,
        8
      );

    const trunkMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x5b3925
      });

    const trunk =
      new THREE.Mesh(
        trunkGeometry,
        trunkMaterial
      );

    trunk.position.y = 1;

    trunk.castShadow = true;

    tree.add(trunk);

    /* leaves */

    const leavesGeometry =
      new THREE.SphereGeometry(
        1.25,
        8,
        8
      );

    const leavesMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x1d7139
      });

    const leaves =
      new THREE.Mesh(
        leavesGeometry,
        leavesMaterial
      );

    leaves.position.y = 2.7;

    leaves.castShadow = true;

    tree.add(leaves);

    tree.position.set(
      x,
      0,
      z
    );

    trees.add(tree);
  }

  for (
    let z = -240;
    z < 250;
    z += 15
  ) {

    createTree(
      -18 - Math.random() * 8,
      z
    );

    createTree(
      18 + Math.random() * 8,
      z
    );
  }

  /* =========================================================
     CAR
     ========================================================= */

  const car =
    new THREE.Group();

  scene.add(car);

  car.position.set(
    0,
    0.55,
    0
  );

  /* body */

  const bodyGeometry =
    new THREE.BoxGeometry(
      2.2,
      0.65,
      4
    );

  const bodyMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x168cff,
      metalness: 0.5,
      roughness: 0.3
    });

  const body =
    new THREE.Mesh(
      bodyGeometry,
      bodyMaterial
    );

  body.castShadow = true;

  car.add(body);

  /* roof */

  const roofGeometry =
    new THREE.BoxGeometry(
      1.6,
      0.55,
      1.9
    );

  const roofMaterial =
    new THREE.MeshStandardMaterial({
      color: 0x0e4e9b,
      metalness: 0.4,
      roughness: 0.25
    });

  const roof =
    new THREE.Mesh(
      roofGeometry,
      roofMaterial
    );

  roof.position.y = 0.55;

  roof.position.z = -0.15;

  roof.castShadow = true;

  car.add(roof);

  /* =========================================================
     WHEELS
     ========================================================= */

  const wheels = [];

  function createWheel(
    x,
    z
  ) {

    const geometry =
      new THREE.CylinderGeometry(
        0.42,
        0.42,
        0.3,
        16
      );

    const material =
      new THREE.MeshStandardMaterial({
        color: 0x111111
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
      -0.45,
      z
    );

    wheel.castShadow = true;

    car.add(wheel);

    wheels.push(wheel);

    return wheel;
  }

  const frontLeft =
    createWheel(
      -1.05,
      -1.25
    );

  const frontRight =
    createWheel(
      1.05,
      -1.25
    );

  createWheel(
    -1.05,
    1.25
  );

  createWheel(
    1.05,
    1.25
  );

  /* =========================================================
     HEADLIGHTS
     ========================================================= */

  function createHeadlight(x) {

    const geometry =
      new THREE.BoxGeometry(
        0.35,
        0.18,
        0.08
      );

    const material =
      new THREE.MeshBasicMaterial({
        color: 0xffffcc
      });

    const light =
      new THREE.Mesh(
        geometry,
        material
      );

    light.position.set(
      x,
      0.05,
      -2.03
    );

    car.add(light);
  }

  createHeadlight(-0.65);
  createHeadlight(0.65);

  /* =========================================================
     QUEST ZONES
     ========================================================= */

  const zones =
    new THREE.Group();

  world.add(zones);

  const zoneData = [];

  function createQuestZone(
    z,
    color,
    label
  ) {

    const geometry =
      new THREE.BoxGeometry(
        ROAD_WIDTH - 1,
        0.08,
        4
      );

    const material =
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45
      });

    const zone =
      new THREE.Mesh(
        geometry,
        material
      );

    zone.position.set(
      0,
      0.09,
      z
    );

    zones.add(zone);

    zoneData.push({
      mesh: zone,
      z,
      label,
      completed: false
    });
  }

  createQuestZone(
    -60,
    0x00ffff,
    "QUEST 1"
  );

  createQuestZone(
    -130,
    0xff00ff,
    "QUEST 2"
  );

  createQuestZone(
    -200,
    0xffff00,
    "QUEST 3"
  );

  /* =========================================================
     HUD
     ========================================================= */

  const hud =
    document.createElement("div");

  hud.style.position = "fixed";
  hud.style.top = "18px";
  hud.style.left = "18px";
  hud.style.zIndex = "10";
  hud.style.fontFamily =
    "Arial, sans-serif";
  hud.style.color = "#ffffff";
  hud.style.background =
    "rgba(0,0,0,.65)";
  hud.style.padding = "14px 18px";
  hud.style.border =
    "1px solid rgba(255,255,255,.2)";
  hud.style.borderRadius = "8px";
  hud.style.minWidth = "180px";

  document.body.appendChild(hud);

  function updateHUD() {

    const mph =
      Math.round(
        Math.abs(GAME.speed) * 100
      );

    hud.innerHTML = `
      <strong>CODEQUESTER</strong>
      <br><br>
      SPEED: ${mph}
      <br>
      QUEST: ${GAME.quest}
      <br>
      SCORE: ${GAME.score}
      <br><br>
      W / ↑ Accelerate
      <br>
      S / ↓ Brake
      <br>
      A D / ← → Steer
    `;
  }

  /* =========================================================
     KEYBOARD
     ========================================================= */

  window.addEventListener(
    "keydown",
    event => {

      switch (event.key.toLowerCase()) {

        case "w":
        case "arrowup":
          GAME.keys.forward = true;
          break;

        case "s":
        case "arrowdown":
          GAME.keys.backward = true;
          break;

        case "a":
        case "arrowleft":
          GAME.keys.left = true;
          break;

        case "d":
        case "arrowright":
          GAME.keys.right = true;
          break;
      }
    }
  );

  window.addEventListener(
    "keyup",
    event => {

      switch (event.key.toLowerCase()) {

        case "w":
        case "arrowup":
          GAME.keys.forward = false;
          break;

        case "s":
        case "arrowdown":
          GAME.keys.backward = false;
          break;

        case "a":
        case "arrowleft":
          GAME.keys.left = false;
          break;

        case "d":
        case "arrowright":
          GAME.keys.right = false;
          break;
      }
    }
  );

  /* =========================================================
     CAR MOVEMENT
     ========================================================= */

  function updateCar() {

    /* acceleration */

    if (GAME.keys.forward) {

      GAME.speed +=
        GAME.acceleration;

    }

    /* braking */

    if (GAME.keys.backward) {

      GAME.speed -=
        GAME.braking;

    }

    /* natural friction */

    if (
      !GAME.keys.forward &&
      !GAME.keys.backward
    ) {

      if (GAME.speed > 0) {

        GAME.speed -=
          GAME.friction;

        if (GAME.speed < 0) {
          GAME.speed = 0;
        }

      }

      if (GAME.speed < 0) {

        GAME.speed +=
          GAME.friction;

        if (GAME.speed > 0) {
          GAME.speed = 0;
        }

      }
    }

    GAME.speed =
      THREE.MathUtils.clamp(
        GAME.speed,
        -0.25,
        GAME.maxSpeed
      );

    /* steering */

    let steer = 0;

    if (GAME.keys.left) {
      steer -= 1;
    }

    if (GAME.keys.right) {
      steer += 1;
    }

    GAME.steering =
      THREE.MathUtils.lerp(
        GAME.steering,
        steer,
        0.12
      );

    car.rotation.y =
      THREE.MathUtils.lerp(
        car.rotation.y,
        -GAME.steering * 0.35,
        0.1
      );

    /* movement */

    car.position.z -=
      GAME.speed;

    car.position.x +=
      GAME.steering *
      Math.abs(GAME.speed) *
      GAME.steeringPower *
      12;

    /* road boundaries */

    car.position.x =
      THREE.MathUtils.clamp(
        car.position.x,
        -5,
        5
      );

    /* wheel animation */

    wheels.forEach(wheel => {

      wheel.rotation.x -=
        GAME.speed * 2;

    });

    GAME.distance +=
      Math.abs(GAME.speed);
  }

  /* =========================================================
     QUEST SYSTEM
     ========================================================= */

  function updateQuests() {

    zoneData.forEach(zone => {

      if (
        !zone.completed &&
        Math.abs(
          car.position.z - zone.z
        ) < 3
      ) {

        zone.completed = true;

        GAME.score += 100;

        GAME.quest++;

        zone.mesh.material.opacity =
          0.9;
      }

    });
  }

  /* =========================================================
     CAMERA
     ========================================================= */

  function updateCamera() {

    const targetX =
      car.position.x;

    const targetZ =
      car.position.z + 9;

    camera.position.x =
      THREE.MathUtils.lerp(
        camera.position.x,
        targetX,
        0.08
      );

    camera.position.y =
      THREE.MathUtils.lerp(
        camera.position.y,
        5.5,
        0.08
      );

    camera.position.z =
      THREE.MathUtils.lerp(
        camera.position.z,
        targetZ,
        0.08
      );

    camera.lookAt(
      car.position.x,
      0.7,
      car.position.z - 8
    );
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
     GAME LOOP
     ========================================================= */

  const clock =
    new THREE.Clock();

  function animate() {

    requestAnimationFrame(
      animate
    );

    const delta =
      clock.getDelta();

    updateCar();
    updateQuests();
    updateCamera();
    updateHUD();

    /* subtle zone animation */

    zones.children.forEach(
      (zone, index) => {

        if (
          !zoneData[index].completed
        ) {

          zone.material.opacity =
            0.25 +
            Math.sin(
              performance.now() *
              0.004
            ) * 0.2;

        }
      }
    );

    renderer.render(
      scene,
      camera
    );
  }

  updateHUD();

  animate();

})();
