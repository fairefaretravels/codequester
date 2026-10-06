/* =========================================================
   CODEQUESTER — TRACK GENERATOR
   Three.js translation of TrackGenerator.cs
   ========================================================= */

class TrackGenerator {

  constructor(scene) {

    this.scene = scene;

    this.pointCount = 24;
    this.radiusMin = 60;
    this.radiusMax = 90;

    this.laneHalfWidth = 6;
    this.samplesPerSegment = 18;

    this.waypoints = [];

    this.road = null;
    this.zones = [];
    this.ramps = [];
    this.buildings = [];

    this.materials = this.createMaterials();
  }

  /* =======================================================
     MATERIALS
     ======================================================= */

  createMaterials() {

    return {

      road: new THREE.MeshStandardMaterial({
        color: 0x10141c,
        roughness: 0.75,
        metalness: 0.25
      }),

      roadGrid: new THREE.MeshBasicMaterial({
        color: 0x18354a,
        transparent: true,
        opacity: 0.35
      }),

      neon: new THREE.MeshBasicMaterial({
        color: 0x00eaff
      }),

      red: new THREE.MeshBasicMaterial({
        color: 0xff1744,
        transparent: true,
        opacity: 0.65
      }),

      green: new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.65
      }),

      blue: new THREE.MeshBasicMaterial({
        color: 0x2299ff,
        transparent: true,
        opacity: 0.65
      }),

      boost: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55
      }),

      building: new THREE.MeshStandardMaterial({
        color: 0x111522,
        roughness: 0.8,
        metalness: 0.2
      }),

      window: new THREE.MeshBasicMaterial({
        color: 0x00d9ff
      })

    };
  }

  /* =======================================================
     GENERATE
     ======================================================= */

  generate() {

    const points =
      this.scatterPoints(
        this.pointCount,
        this.radiusMin,
        this.radiusMax
      );

    const hull =
      this.grahamScan(points);

    const loop =
      this.catmullRomClosed(
        hull,
        this.samplesPerSegment
      );

    this.waypoints = loop;

    this.buildRoadMesh(loop);

    this.placeInteractiveZones(loop);

    this.buildBackground(loop);

    return loop;
  }

  /* =======================================================
     1. SCATTER POINTS
     ======================================================= */

  scatterPoints(
    count,
    minRadius,
    maxRadius
  ) {

    const points = [];

    for (let i = 0; i < count; i++) {

      const angle =
        Math.random() *
        Math.PI * 2;

      const radius =
        THREE.MathUtils.lerp(
          minRadius,
          maxRadius,
          Math.random()
        );

      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });

    }

    return points;
  }

  /* =======================================================
     2. CONVEX HULL
     Graham-scan style monotonic hull
     ======================================================= */

  grahamScan(points) {

    if (points.length < 3) {
      return points;
    }

    const pts =
      [...points].sort((a, b) => {

        if (a.y !== b.y) {
          return a.y - b.y;
        }

        return a.x - b.x;

      });

    const cross =
      (o, a, b) =>
        (a.x - o.x) *
        (b.y - o.y) -
        (a.y - o.y) *
        (b.x - o.x);

    const lower = [];

    for (const p of pts) {

      while (
        lower.length >= 2 &&
        cross(
          lower[lower.length - 2],
          lower[lower.length - 1],
          p
        ) <= 0
      ) {

        lower.pop();

      }

      lower.push(p);
    }

    const upper = [];

    for (
      let i = pts.length - 1;
      i >= 0;
      i--
    ) {

      const p = pts[i];

      while (
        upper.length >= 2 &&
        cross(
          upper[upper.length - 2],
          upper[upper.length - 1],
          p
        ) <= 0
      ) {

        upper.pop();

      }

      upper.push(p);
    }

    lower.pop();
    upper.pop();

    return lower.concat(upper);
  }

  /* =======================================================
     3. CLOSED CATMULL-ROM
     ======================================================= */

  catmullRomClosed(
    hull,
    samples
  ) {

    const result = [];

    const count = hull.length;

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const p0 =
        hull[
          (i - 1 + count) %
          count
        ];

      const p1 =
        hull[i];

      const p2 =
        hull[
          (i + 1) %
          count
        ];

      const p3 =
        hull[
          (i + 2) %
          count
        ];

      for (
        let s = 0;
        s < samples;
        s++
      ) {

        const t =
          s / samples;

        const t2 =
          t * t;

        const t3 =
          t2 * t;

        const x =
          0.5 *
          (
            (-p0.x +
              3 * p1.x -
              3 * p2.x +
              p3.x) * t3 +

            (2 * p0.x -
              5 * p1.x +
              4 * p2.x -
              p3.x) * t2 +

            (-p0.x +
              p2.x) * t +

            2 * p1.x
          );

        const y =
          0.5 *
          (
            (-p0.y +
              3 * p1.y -
              3 * p2.y +
              p3.y) * t3 +

            (2 * p0.y -
              5 * p1.y +
              4 * p2.y -
              p3.y) * t2 +

            (-p0.y +
              p2.y) * t +

            2 * p1.y
          );

        result.push(
          new THREE.Vector3(
            x,
            0,
            y
          )
        );

      }
    }

    return result;
  }

  /* =======================================================
     4. ROAD MESH
     ======================================================= */

  buildRoadMesh(loop) {

    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const count = loop.length;

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const current =
        loop[i];

      const next =
        loop[
          (i + 1) % count
        ];

      const dx =
        next.x - current.x;

      const dz =
        next.z - current.z;

      const length =
        Math.sqrt(
          dx * dx +
          dz * dz
        );

      if (length === 0) {
        continue;
      }

      /* perpendicular */

      const nx =
        -dz / length;

      const nz =
        dx / length;

      const left =
        new THREE.Vector3(
          current.x +
            nx *
            this.laneHalfWidth,

          0,

          current.z +
            nz *
            this.laneHalfWidth
        );

      const right =
        new THREE.Vector3(
          current.x -
            nx *
            this.laneHalfWidth,

          0,

          current.z -
            nz *
            this.laneHalfWidth
        );

      vertices.push(
        left.x,
        0,
        left.z,

        right.x,
        0,
        right.z
      );

      normals.push(
        0, 1, 0,
        0, 1, 0
      );

      const u =
        i / count;

      uvs.push(
        0, u,
        1, u
      );
    }

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const next =
        (i + 1) % count;

      const a = i * 2;
      const b = i * 2 + 1;

      const c = next * 2;
      const d = next * 2 + 1;

      indices.push(
        a, b, c,
        b, d, c
      );
    }

    const geometry =
      new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        vertices,
        3
      )
    );

    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        normals,
        3
      )
    );

    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        uvs,
        2
      )
    );

    geometry.setIndex(indices);

    geometry.computeBoundingSphere();

    this.road =
      new THREE.Mesh(
        geometry,
        this.materials.road
      );

    this.road.receiveShadow = true;

    this.scene.add(
      this.road
    );

    this.buildNeonEdges(loop);
    this.buildGrid(loop);
  }

  /* =======================================================
     NEON ROAD EDGES
     ======================================================= */

  buildNeonEdges(loop) {

    const leftPoints = [];
    const rightPoints = [];

    const count = loop.length;

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const current =
        loop[i];

      const next =
        loop[
          (i + 1) % count
        ];

      const dx =
        next.x - current.x;

      const dz =
        next.z - current.z;

      const length =
        Math.sqrt(
          dx * dx +
          dz * dz
        );

      const nx =
        -dz / length;

      const nz =
        dx / length;

      leftPoints.push(
        new THREE.Vector3(
          current.x +
            nx *
            this.laneHalfWidth,

          0.12,

          current.z +
            nz *
            this.laneHalfWidth
        )
      );

      rightPoints.push(
        new THREE.Vector3(
          current.x -
            nx *
            this.laneHalfWidth,

          0.12,

          current.z -
            nz *
            this.laneHalfWidth
        )
      );
    }

    this.createNeonLine(
      leftPoints
    );

    this.createNeonLine(
      rightPoints
    );
  }

  createNeonLine(points) {

    const curve =
      new THREE.CatmullRomCurve3(
        points,
        true
      );

    const geometry =
      new THREE.TubeGeometry(
        curve,
        points.length * 2,
        0.06,
        5,
        true
      );

    const mesh =
      new THREE.Mesh(
        geometry,
        this.materials.neon
      );

    this.scene.add(mesh);
  }

  /* =======================================================
     GRID
     ======================================================= */

  buildGrid(loop) {

    const grid =
      new THREE.GridHelper(
        260,
        52,
        0x16445a,
        0x0b2634
      );

    grid.position.y =
      0.015;

    grid.material.transparent =
      true;

    grid.material.opacity =
      0.3;

    this.scene.add(grid);
  }

  /* =======================================================
     5. INTERACTIVE ZONES
     ======================================================= */

  placeInteractiveZones(loop) {

    this.zones = [];

    const spacing = 120;

    let distance = 0;

    let nextZone =
      spacing;

    let zoneIndex = 0;

    for (
      let i = 0;
      i < loop.length;
      i++
    ) {

      const a =
        loop[i];

      const b =
        loop[
          (i + 1) % loop.length
        ];

      const segment =
        a.distanceTo(b);

      distance += segment;

      if (
        distance >= nextZone
      ) {

        const colors = [
          {
            name: "RED",
            color: 0xff1744,
            material:
              this.materials.red
          },
          {
            name: "GREEN",
            color: 0x00ff88,
            material:
              this.materials.green
          },
          {
            name: "BLUE",
            color: 0x2299ff,
            material:
              this.materials.blue
          }
        ];

        const data =
          colors[
            zoneIndex %
            colors.length
          ];

        this.createZone(
          a,
          b,
          data
        );

        zoneIndex++;

        nextZone += spacing;
      }
    }

    /* Additional speed boosts */

    for (
      let i = 0;
      i < loop.length;
      i += 110
    ) {

      this.createBoost(
        loop[i],
        loop[
          (i + 2) %
          loop.length
        ]
      );
    }

    /* Jump ramps */

    for (
      let i = 45;
      i < loop.length;
      i += 145
    ) {

      this.createRamp(
        loop[i],
        loop[
          (i + 2) %
          loop.length
        ]
      );
    }
  }

  /* =======================================================
     COLOR ZONE
     ======================================================= */

  createZone(
    point,
    next,
    data
  ) {

    const geometry =
      new THREE.BoxGeometry(
        this.laneHalfWidth * 2,
        0.12,
        7
      );

    const zone =
      new THREE.Mesh(
        geometry,
        data.material
      );

    zone.position.copy(point);

    zone.position.y =
      0.15;

    const angle =
      Math.atan2(
        next.z - point.z,
        next.x - point.x
      );

    zone.rotation.y =
      -angle +
      Math.PI / 2;

    zone.userData = {
      type: "colorZone",
      color: data.name,
      boostColor: data.color,
      active: true
    };

    this.scene.add(zone);

    this.zones.push(zone);
  }

  /* =======================================================
     SPEED BOOST
     ======================================================= */

  createBoost(
    point,
    next
  ) {

    const geometry =
      new THREE.BoxGeometry(
        4,
        0.15,
        5
      );

    const boost =
      new THREE.Mesh(
        geometry,
        this.materials.boost
      );

    boost.position.copy(point);

    boost.position.y =
      0.2;

    const angle =
      Math.atan2(
        next.z - point.z,
        next.x - point.x
      );

    boost.rotation.y =
      -angle +
      Math.PI / 2;

    boost.userData = {
      type: "speedBoost",
      active: true
    };

    this.scene.add(boost);

    this.zones.push(boost);
  }

  /* =======================================================
     JUMP RAMP
     ======================================================= */

  createRamp(
    point,
    next
  ) {

    const geometry =
      new THREE.CylinderGeometry(
        0,
        2.8,
        5,
        4
      );

    const ramp =
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0x7b2cff,
          emissive: 0x220044,
          emissiveIntensity: 1
        })
      );

    ramp.position.copy(point);

    ramp.position.y =
      1;

    const angle =
      Math.atan2(
        next.z - point.z,
        next.x - point.x
      );

    ramp.rotation.z =
      Math.PI / 2;

    ramp.rotation.y =
      -angle;

    ramp.userData = {
      type: "jumpRamp"
    };

    this.scene.add(ramp);

    this.ramps.push(ramp);
  }

  /* =======================================================
     6. BACKGROUND CITY
     ======================================================= */

  buildBackground(loop) {

    const city =
      new THREE.Group();

    const radius = 125;

    for (
      let i = 0;
      i < 90;
      i++
    ) {

      const angle =
        Math.random() *
        Math.PI * 2;

      const distance =
        radius +
        Math.random() * 75;

      const x =
        Math.cos(angle) *
        distance;

      const z =
        Math.sin(angle) *
        distance;

      const width =
        3 +
        Math.random() * 6;

      const depth =
        3 +
        Math.random() * 6;

      const height =
        5 +
        Math.random() * 25;

      const geometry =
        new THREE.BoxGeometry(
          width,
          height,
          depth
        );

      const building =
        new THREE.Mesh(
          geometry,
          this.materials.building
        );

      building.position.set(
        x,
        height / 2,
        z
      );

      building.castShadow =
        true;

      building.receiveShadow =
        true;

      city.add(building);

      /* windows */

      const windowCount =
        Math.max(
          2,
          Math.floor(height / 4)
        );

      for (
        let w = 0;
        w < windowCount;
        w++
      ) {

        const windowGeometry =
          new THREE.BoxGeometry(
            width * 0.55,
            0.25,
            0.04
          );

        const window =
          new THREE.Mesh(
            windowGeometry,
            this.materials.window
          );

        window.position.set(
          x,
          2 +
            w * 4,
          z -
            depth / 2 -
            0.03
        );

        city.add(window);
      }
    }

    this.scene.add(city);

    this.buildSkyGrid();
  }

  /* =======================================================
     DIGITAL SKY / GRID
     ======================================================= */

  buildSkyGrid() {

    const geometry =
      new THREE.PlaneGeometry(
        600,
        600
      );

    const material =
      new THREE.MeshBasicMaterial({
        color: 0x02050b,
        side: THREE.DoubleSide
      });

    const plane =
      new THREE.Mesh(
        geometry,
        material
      );

    plane.rotation.x =
      -Math.PI / 2;

    plane.position.y =
      -0.05;

    this.scene.add(plane);
  }
}
