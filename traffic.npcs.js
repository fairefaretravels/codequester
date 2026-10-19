
/* =========================================================
   CODEQUESTER — TRAFFIC & WALKING NPCs
   Plain JavaScript — Three.js r156
   Requires window.CQWorld from main.js.
   ========================================================= */

(function () {
  "use strict";

  const THREE = window.THREE;

  const TRAFFIC_COUNT = 10;
  const PEDESTRIAN_COUNT = 8;
  const ROAD_OFFSET = 4.1;
  const WALK_OFFSET = 9.5;

  let world = null;
  let cars = [];
  let pedestrians = [];
  let initialized = false;

  function makeMaterial(color, roughness = 0.8) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness
    });
  }

  function makeBox(parent, width, height, depth, material, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    return mesh;
  }

  function makeTrafficCar(index) {
    const group = new THREE.Group();

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
    const light = makeMaterial(0xffe8a3);
    const tailLight = makeMaterial(0xd51e25);

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

    // Four wheels
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const wheel = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.48, 0.72),
          tire
        );

        wheel.position.set(
          x * (type.width / 2),
          0.42,
          z * (type.length * 0.29)
        );

        group.add(wheel);
      }
    }

    // Front lights and rear lights.
    for (const x of [-0.58, 0.58]) {
      makeBox(
        group, 0.25, 0.16, 0.08,
        light, x, 0.72, -type.length / 2 - 0.02
      );

      makeBox(
        group, 0.25, 0.16, 0.08,
        tailLight, x, 0.72, type.length / 2 + 0.02
      );
    }

    world.scene.add(group);

    return {
      mesh: group,
      waypoint: Math.floor(
        (index / TRAFFIC_COUNT) * world.track.length
      ),
      offset: index % 2 === 0 ? ROAD_OFFSET : -ROAD_OFFSET,
      speed: 0.65 + (index % 4) * 0.12,
      type
    };
  }

  function makePedestrian(index) {
    const group = new THREE.Group();

    const skinColors = [0x8d5524, 0xc68642, 0xf1c27d, 0x5c3830];
    const shirtColors = [
      0x2b4c7e,
      0x8f3030,
      0x356b52,
      0x444444,
      0x80633d
    ];

    const skin = makeMaterial(skinColors[index % skinColors.length]);
    const shirt = makeMaterial(shirtColors[index % shirtColors.length]);
    const pants = makeMaterial(index % 2 ? 0x262b35 : 0x353535);
    const shoes = makeMaterial(0x171717);

    makeBox(group, 0.48, 0.75, 0.27, shirt, 0, 1.25, 0);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 10),
      skin
    );

    head.position.set(0, 1.8, 0);
    group.add(head);

    const leftLeg = makeBox(
      group, 0.17, 0.55, 0.18,
      pants, -0.13, 0.6, 0
    );

    const rightLeg = makeBox(
      group, 0.17, 0.55, 0.18,
      pants, 0.13, 0.6, 0
    );

    const leftArm = makeBox(
      group, 0.14, 0.55, 0.16,
      skin, -0.34, 1.25, 0
    );

    const rightArm = makeBox(
      group, 0.14, 0.55, 0.16,
      skin, 0.34, 1.25, 0
    );

    makeBox(
      group, 0.2, 0.12, 0.3,
      shoes, -0.13, 0.3, -0.04
    );

    makeBox(
      group, 0.2, 0.12, 0.3,
      shoes, 0.13, 0.3, -0.04
    );

    world.scene.add(group);

    return {
      mesh: group,
      waypoint: Math.floor(
        (index / PEDESTRIAN_COUNT) * world.track.length
      ),
      offset: index % 2 === 0 ? WALK_OFFSET : -WALK_OFFSET,
      speed: 0.45 + (index % 3) * 0.12,
      phase: index * 1.7,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm
    };
  }

  function placeOnTrack(actor, offset) {
    const points = world.track;
    const count = points.length;

    const i = ((actor.waypoint % count) + count) % count;
    const current = points[i];
    const next = points[(i + 1) % count];

    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const length = Math.sqrt(dx * dx + dz * dz) || 1;

    // Offset from the road centerline.
    actor.mesh.position.set(
      current.x + (dz / length) * offset,
      0,
      current.z - (dx / length) * offset
    );

    // Vehicles face forward along the waypoint direction.
    actor.mesh.rotation.y = Math.atan2(-dx, -dz);
  }

  function init() {
    if (initialized) return true;

    world = window.CQWorld;

    if (
      !THREE ||
      !world ||
      !world.scene ||
      !world.track ||
      world.track.length < 2
    ) {
      console.warn(
        "CodeQuestER traffic: CQWorld or track waypoints are missing."
      );
      return false;
    }

    cars = [];
    pedestrians = [];

    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const car = makeTrafficCar(i);
      placeOnTrack(car, car.offset);
      cars.push(car);
    }

    for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
      const person = makePedestrian(i);
      placeOnTrack(person, person.offset);
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
  }

  function update(delta) {
    if (!initialized) {
      init();
      return;
    }

    const points = world.track;
    const count = points.length;

    for (const car of cars) {
      car.waypoint =
        (car.waypoint + car.speed * delta) % count;

      placeOnTrack(car, car.offset);
    }

    for (const person of pedestrians) {
      person.waypoint =
        (person.waypoint + person.speed * delta) % count;

      placeOnTrack(person, person.offset);

      person.phase += delta * 5;

      const swing = Math.sin(person.phase) * 0.45;

      person.leftLeg.rotation.x = swing;
      person.rightLeg.rotation.x = -swing;
      person.leftArm.rotation.x = -swing * 0.7;
      person.rightArm.rotation.x = swing * 0.7;
    }
  }

  window.CQTrafficNPCs = {
    init,
    update
  };

  init();
})();
