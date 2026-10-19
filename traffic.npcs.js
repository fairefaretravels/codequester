
/* =========================================================
   CODEQUESTER — TRAFFIC & WALKING NPCs
   Three.js r156 | Plain JavaScript | No ES modules

   Requires:
     - Three.js loaded first
     - main.js publishing window.CQWorld
     - window.CQWorld.track containing waypoint objects

   Features:
     - 10 moving traffic vehicles
     - 8 animated pedestrians
     - Smooth waypoint movement and road offsets
     - Safe initialization and retry if the world isn't ready
     - No changes to player driving physics or camera
   ========================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONFIGURATION
     --------------------------------------------------------- */

  const THREE_LIB = window.THREE;

  const TRAFFIC_COUNT = 10;
  const PEDESTRIAN_COUNT = 8;

  const ROAD_OFFSET = 4.1;
  const WALK_OFFSET = 9.5;

  let world = null;
  let cars = [];
  let pedestrians = [];
  let initialized = false;

  /* ---------------------------------------------------------
     MATERIALS AND MESH HELPERS
     --------------------------------------------------------- */

  function makeMaterial(color, roughness) {
    return new THREE_LIB.MeshStandardMaterial({
      color: color,
      roughness: roughness === undefined ? 0.8 : roughness
    });
  }

  function makeBox(
    parent,
    width,
    height,
    depth,
    material,
    x,
    y,
    z
  ) {
    const mesh = new THREE_LIB.Mesh(
      new THREE_LIB.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);

    return mesh;
  }

  function validPoint(point) {
    return !!point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.z);
  }

  /* ---------------------------------------------------------
     TRAFFIC VEHICLES
     --------------------------------------------------------- */

  function makeTrafficCar(index) {
    const group = new THREE_LIB.Group();

    const colors = [
      0xc62828,
      0xe0e0e0,
      0x263b60,
      0x171717,
      0xd6a43b,
      0x377c58,
      0xeeeeee,
      0x6b4c8a,
      0x9c4c36,
      0x53616c
    ];

    const types = [
      { width: 1.8, height: 0.65, length: 3.6 },
      { width: 2.0, height: 0.9, length: 4.2 },
      { width: 1.9, height: 0.85, length: 4.0 },
      { width: 1.7, height: 0.6, length: 3.2 }
    ];

    const type = types[index % types.length];

    const paint = makeMaterial(colors[index % colors.length]);
    const glass = makeMaterial(0x263744, 0.35);
    const tire = makeMaterial(0x171717);
    const headlights = makeMaterial(0xffe8a3);
    const tailLights = makeMaterial(0xd51e25);

    // Main body.
    makeBox(
      group,
      type.width,
      type.height,
      type.length,
      paint,
      0,
      0.65,
      0
    );

    // Cabin and windows.
    makeBox(
      group,
      type.width * 0.76,
      0.55,
      type.length * 0.42,
      glass,
      0,
      1.2,
      -0.15
    );

    // Four wheels.
    for (const xSide of [-1, 1]) {
      for (const zSide of [-1, 1]) {
        const wheel = new THREE_LIB.Mesh(
          new THREE_LIB.BoxGeometry(0.22, 0.48, 0.72),
          tire
        );

        wheel.position.set(
          xSide * (type.width / 2),
          0.42,
          zSide * (type.length * 0.29)
        );

        group.add(wheel);
      }
    }

    // Front headlights and rear lights.
    for (const xSide of [-0.58, 0.58]) {
      makeBox(
        group,
        0.25,
        0.16,
        0.08,
        headlights,
        xSide,
        0.72,
        -type.length / 2 - 0.02
      );

      makeBox(
        group,
        0.25,
        0.16,
        0.08,
        tailLights,
        xSide,
        0.72,
        type.length / 2 + 0.02
      );
    }

    world.scene.add(group);

    const startingWaypoint = Math.floor(
      (index / TRAFFIC_COUNT) * world.track.length
    );

    return {
      mesh: group,
      progress: startingWaypoint,
      offset: index % 2 === 0 ? ROAD_OFFSET : -ROAD_OFFSET,
      speed: 0.65 + (index % 4) * 0.12,
      type: type
    };
  }

  /* ---------------------------------------------------------
     PEDESTRIANS
     --------------------------------------------------------- */

  function makePedestrian(index) {
    const group = new THREE_LIB.Group();

    const skinColors = [
      0x8d5524,
      0xc68642,
      0xf1c27d,
      0x5c3830
    ];

    const shirtColors = [
      0x2b4c7e,
      0x8f3030,
      0x356b52,
      0x444444,
      0x80633d
    ];

    const skin = makeMaterial(
      skinColors[index % skinColors.length]
    );

    const shirt = makeMaterial(
      shirtColors[index % shirtColors.length]
    );

    const pants = makeMaterial(
      index % 2 ? 0x262b35 : 0x353535
    );

    const shoes = makeMaterial(0x171717);

    // Torso.
    makeBox(
      group,
      0.48,
      0.75,
      0.27,
      shirt,
      0,
      1.25,
      0
    );

    // Head.
    const head = new THREE_LIB.Mesh(
      new THREE_LIB.SphereGeometry(0.19, 12, 10),
      skin
    );

    head.position.set(0, 1.8, 0);
    group.add(head);

    // Legs.
    const leftLeg = makeBox(
      group,
      0.17,
      0.55,
      0.18,
      pants,
      -0.13,
      0.6,
      0
    );

    const rightLeg = makeBox(
      group,
      0.17,
      0.55,
      0.18,
      pants,
      0.13,
      0.6,
      0
    );

    // Arms.
    const leftArm = makeBox(
      group,
      0.14,
      0.55,
      0.16,
      skin,
      -0.34,
      1.25,
      0
    );

    const rightArm = makeBox(
      group,
      0.14,
      0.55,
      0.16,
      skin,
      0.34,
      1.25,
      0
    );

    // Shoes.
    makeBox(
      group,
      0.2,
      0.12,
      0.3,
      shoes,
      -0.13,
      0.3,
      -0.04
    );

    makeBox(
      group,
      0.2,
      0.12,
      0.3,
      shoes,
      0.13,
      0.3,
      -0.04
    );

    world.scene.add(group);

    const startingWaypoint = Math.floor(
      (index / PEDESTRIAN_COUNT) * world.track.length
    );

    return {
      mesh: group,
      progress: startingWaypoint,
      offset: index % 2 === 0 ? WALK_OFFSET : -WALK_OFFSET,
      speed: 0.45 + (index % 3) * 0.12,
      phase: index * 1.7,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      leftArm: leftArm,
      rightArm: rightArm
    };
  }

  /* ---------------------------------------------------------
     SMOOTH TRACK POSITIONING

     IMPORTANT:
     Progress can be fractional. We interpolate between
     neighboring points instead of using a fractional array
     index, which would return undefined and break the update.
     --------------------------------------------------------- */

  function placeOnTrack(actor) {
    if (!world || !world.track) return;

    const points = world.track;
    const count = points.length;

    if (count < 2) return;

    // Normalize progress and find the two surrounding points.
    let progress = actor.progress % count;

    if (progress < 0) {
      progress += count;
    }

    const index = Math.floor(progress);
    const nextIndex = (index + 1) % count;
    const fraction = progress - index;

    const current = points[index];
    const next = points[nextIndex];

    if (!validPoint(current) || !validPoint(next)) {
      return;
    }

    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    if (!Number.isFinite(length) || length < 0.0001) {
      actor.mesh.position.set(
        current.x,
        Number.isFinite(current.y) ? current.y : 0,
        current.z
      );
      return;
    }

    // Interpolate between waypoints for smooth movement.
    const x = current.x + dx * fraction;
    const z = current.z + dz * fraction;

    // Offset sideways from the centerline.
    const sideX = dz / length;
    const sideZ = -dx / length;

    actor.mesh.position.set(
      x + sideX * actor.offset,
      Number.isFinite(current.y) ? current.y : 0,
      z + sideZ * actor.offset
    );

    // Face the direction of travel.
    actor.mesh.rotation.y = Math.atan2(-dx, -dz);
  }

  /* ---------------------------------------------------------
     INITIALIZATION
     --------------------------------------------------------- */

  function init() {
    if (initialized) return true;

    // Re-read the world in case main.js initialized after
    // this file was loaded.
    world = window.CQWorld;

    if (!THREE_LIB) {
      console.warn(
        "CodeQuestER traffic: Three.js is not available."
      );
      return false;
    }

    if (
      !world ||
      !world.scene ||
      !Array.isArray(world.track) ||
      world.track.length < 2
    ) {
      return false;
    }

    // Avoid creating NPCs if the initial waypoints are invalid.
    if (
      !validPoint(world.track[0]) ||
      !world.track.some(validPoint)
    ) {
      console.warn(
        "CodeQuestER traffic: Track waypoints are invalid."
      );
      return false;
    }

    cars = [];
    pedestrians = [];

    try {
      for (let i = 0; i < TRAFFIC_COUNT; i++) {
        const car = makeTrafficCar(i);
        placeOnTrack(car);
        cars.push(car);
      }

      for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
        const person = makePedestrian(i);
        placeOnTrack(person);
        pedestrians.push(person);
      }

      initialized = true;

      console.log(
        "CodeQuestER traffic initialized:",
        cars.length,
        "cars and",
        pedestrians.length,
        "pedestrians."
      );

      return true;
    } catch (error) {
      // Remove partially created NPCs if setup fails.
      for (const actor of cars.concat(pedestrians)) {
        if (actor.mesh && actor.mesh.parent) {
          actor.mesh.parent.remove(actor.mesh);
        }
      }

      cars = [];
      pedestrians = [];
      initialized = false;

      console.error(
        "CodeQuestER traffic initialization failed:",
        error
      );

      return false;
    }
  }

  /* ---------------------------------------------------------
     FRAME UPDATE

     main.js can call this every frame. If the world is not
     ready yet, initialization is retried on later frames.
     --------------------------------------------------------- */

  function update(delta) {
    if (!initialized) {
      init();
      return;
    }

    if (!world || !world.track || world.track.length < 2) {
      return;
    }

    // Protect against invalid frame times.
    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    const count = world.track.length;

    // Move traffic.
    for (const car of cars) {
      car.progress = (car.progress + car.speed * delta) % count;
      placeOnTrack(car);
    }

    // Move pedestrians and animate their limbs.
    for (const person of pedestrians) {
      person.progress =
        (person.progress + person.speed * delta) % count;

      placeOnTrack(person);

      person.phase += delta * 5;

      const swing = Math.sin(person.phase) * 0.45;

      person.leftLeg.rotation.x = swing;
      person.rightLeg.rotation.x = -swing;

      person.leftArm.rotation.x = -swing * 0.7;
      person.rightArm.rotation.x = swing * 0.7;
    }
  }

  /* ---------------------------------------------------------
     PUBLIC API
     --------------------------------------------------------- */

  window.CQTrafficNPCs = {
    init: init,
    update: update
  };

  // Try immediately. If main.js has not finished, update()
  // will retry when the game loop calls it.
  init();

  // Also support a world-ready event if main.js dispatches it.
  window.addEventListener("cq:world-ready", init);

})();
