/* =========================================================
   CODEQUESTER — TRACK + CITY GENERATOR
   Three.js r156

   STEP 2 — CITY WORLD

   CURRENT SYSTEM:
      TRACK
      FREE DRIVING
      CITY STREETS
      INTERSECTIONS
      SIDEWALKS
      CITY BLOCKS
      BUILDINGS
      PARKING LOTS
      DESTINATION BUILDINGS

   FUTURE:
      STEP 3 — BUILDING / WALL COLLISION
      STEP 4 — DOORS + ENTERABLE BUILDINGS
      STEP 5 — MISSIONS
      STEP 6 — NPCs
      STEP 7 — MONEY / ECONOMY

   main.js interface:
      const track = new TrackGenerator(scene);
      const waypoints = track.generate();

      track.laneHalfWidth
      track.zones
      track.ramps
   ========================================================= */

class TrackGenerator {

  constructor(scene, options = {}) {

    this.scene = scene;

    /* =======================================================
       TRACK
       ======================================================= */

    this.pointCount = 24;

    this.radiusMin = 60;
    this.radiusMax = 90;

    this.laneHalfWidth = 6;

    this.waypointSpacing = 2;

    /* =======================================================
       TRACK GAMEPLAY
       ======================================================= */

    this.zoneSpacing = 120;
    this.zoneStartOffset = 60;

    /* =======================================================
       CITY
       ======================================================= */

    this.citySize = 560;

    this.cityBlockSize = 52;

    this.streetWidth = 14;

    this.sidewalkWidth = 3;

    this.buildingGap = 5;

    this.buildingMinHeight = 8;

    this.buildingMaxHeight = 34;

    /* =======================================================
       CITY OBJECT COLLECTIONS
       ======================================================= */

    this.waypoints = [];

    this.zones = [];

    this.ramps = [];

    this.buildings = [];

    this.streets = [];

    this.sidewalks = [];

    this.parkingLots = [];

    this.destinations = [];

    this.intersections = [];

    /* =======================================================
       OPTIONS
       ======================================================= */

    Object.assign(
      this,
      options
    );

    /* =======================================================
       MAIN WORLD GROUP
       ======================================================= */

    this.group =
      new THREE.Group();

    this.group.name =
      "CodeQuestER_World";
  }


  /* =========================================================
     PUBLIC GENERATE
     ========================================================= */

  generate() {

    this.dispose();

    /* =======================================================
       GENERATE TRACK
       ======================================================= */

    let loop = null;

    for (
      let attempt = 0;
      attempt < 60 && !loop;
      attempt++
    ) {

      const pts =
        this.scatterPoints(
          this.pointCount,
          this.radiusMin,
          this.radiusMax
        );

      const hull =
        this.convexHull(
          pts
        );

      if (
        hull.length < 8
      ) {
        continue;
      }

      const smooth =
        this.chaikin(
          hull
        );

      const candidate =
        this.catmullRomClosed(
          smooth,
          this.waypointSpacing
        );

      if (
        this.isDrivable(
          candidate
        )
      ) {

        loop =
          candidate;
      }
    }

    if (!loop) {

      loop =
        this.catmullRomClosed(
          this.fallbackLoop(),
          this.waypointSpacing
        );
    }

    this.waypoints =
      loop;

    /* =======================================================
       ADD WORLD
       ======================================================= */

    this.scene.add(
      this.group
    );

    /* =======================================================
       TRACK
       ======================================================= */

    this.buildRoadMesh(
      this.waypoints
    );

    /* =======================================================
       TRACK GAMEPLAY
       ======================================================= */

    this.placeInteractiveZones(
      this.waypoints
    );

    /* =======================================================
       WORLD
       ======================================================= */

    this.buildBackground();

    /* =======================================================
       CITY
       ======================================================= */

    this.buildCity(
      this.waypoints
    );

    return this.waypoints;
  }


  /* =========================================================
     DISPOSE
     ========================================================= */

  dispose() {

    if (
      this.group.parent
    ) {

      this.group.parent.remove(
        this.group
      );
    }

    this.group.traverse(
      obj => {

        if (
          obj.geometry
        ) {

          obj.geometry.dispose();
        }

        if (
          obj.material
        ) {

          const materials =
            Array.isArray(
              obj.material
            )
              ? obj.material
              : [obj.material];

          materials.forEach(
            material => {

              if (
                material.map
              ) {

                material.map.dispose();
              }

              if (
                material.emissiveMap
              ) {

                material.emissiveMap.dispose();
              }

              material.dispose();
            }
          );
        }
      }
    );

    this.group.clear();

    this.waypoints = [];

    this.zones = [];

    this.ramps = [];

    this.buildings = [];

    this.streets = [];

    this.sidewalks = [];

    this.parkingLots = [];

    this.destinations = [];

    this.intersections = [];
  }


  /* =========================================================
     1 — SCATTER TRACK POINTS
     ========================================================= */

  scatterPoints(
    n,
    r0,
    r1
  ) {

    const pts = [];

    for (
      let i = 0;
      i < n;
      i++
    ) {

      const angle =
        (
          i +
          Math.random() * 0.7
        ) /
        n *
        Math.PI *
        2;

      const radius =
        r0 +
        Math.random() *
        (
          r1 -
          r0
        );

      pts.push(
        new THREE.Vector2(
          Math.cos(angle) *
            radius,

          Math.sin(angle) *
            radius
        )
      );
    }

    return pts;
  }


  /* =========================================================
     2 — CONVEX HULL
     ========================================================= */

  convexHull(
    points
  ) {

    const pts =
      points
        .map(
          p =>
            p.clone()
        )
        .sort(
          (a, b) =>
            a.x -
              b.x ||
            a.y -
              b.y
        );

    if (
      pts.length < 3
    ) {

      return pts;
    }

    const cross =
      (
        o,
        a,
        b
      ) =>
        (
          a.x -
          o.x
        ) *
        (
          b.y -
          o.y
        ) -
        (
          a.y -
          o.y
        ) *
        (
          b.x -
          o.x
        );

    const lower = [];

    for (
      const p of pts
    ) {

      while (
        lower.length >= 2 &&
        cross(
          lower[
            lower.length - 2
          ],
          lower[
            lower.length - 1
          ],
          p
        ) <= 0
      ) {

        lower.pop();
      }

      lower.push(
        p
      );
    }

    const upper = [];

    for (
      let i =
        pts.length - 1;
      i >= 0;
      i--
    ) {

      const p =
        pts[i];

      while (
        upper.length >= 2 &&
        cross(
          upper[
            upper.length - 2
          ],
          upper[
            upper.length - 1
          ],
          p
        ) <= 0
      ) {

        upper.pop();
      }

      upper.push(
        p
      );
    }

    lower.pop();

    upper.pop();

    return lower.concat(
      upper
    );
  }


  /* =========================================================
     FALLBACK LOOP
     ========================================================= */

  fallbackLoop() {

    const pts = [];

    const count = 12;

    const radius =
      (
        this.radiusMin +
        this.radiusMax
      ) /
      2;

    for (
      let i = 0;
      i < count;
      i++
    ) {

      const angle =
        (
          i /
          count
        ) *
        Math.PI *
        2;

      pts.push(
        new THREE.Vector2(
          Math.cos(angle) *
            radius,

          Math.sin(angle) *
            radius
        )
      );
    }

    return pts;
  }


  /* =========================================================
     CHAIKIN
     ========================================================= */

  chaikin(
    poly
  ) {

    const out = [];

    const m =
      poly.length;

    for (
      let i = 0;
      i < m;
      i++
    ) {

      const a =
        poly[i];

      const b =
        poly[
          (
            i + 1
          ) % m
        ];

      out.push(

        new THREE.Vector2(
          a.x * 0.75 +
          b.x * 0.25,

          a.y * 0.75 +
          b.y * 0.25
        ),

        new THREE.Vector2(
          a.x * 0.25 +
          b.x * 0.75,

          a.y * 0.25 +
          b.y * 0.75
        )
      );
    }

    return out;
  }


  /* =========================================================
     CATMULL-ROM CLOSED
     ========================================================= */

  catmullRomClosed(
    pts,
    spacing
  ) {

    const res = [];

    const m =
      pts.length;

    const alpha =
      0.5;

    const dist =
      (
        a,
        b
      ) =>
        Math.hypot(
          a.x -
            b.x,

          a.y -
            b.y
        );

    const mix =
      (
        a,
        b,
        w
      ) => ({

        x:
          a.x *
            (1 - w) +
          b.x *
            w,

        y:
          a.y *
            (1 - w) +
          b.y *
            w
      });

    for (
      let i = 0;
      i < m;
      i++
    ) {

      const p0 =
        pts[
          (
            i -
            1 +
            m
          ) % m
        ];

      const p1 =
        pts[i];

      const p2 =
        pts[
          (
            i + 1
          ) % m
        ];

      const p3 =
        pts[
          (
            i + 2
          ) % m
        ];

      const t0 = 0;

      const t1 =
        t0 +
        Math.max(
          Math.pow(
            dist(
              p0,
              p1
            ),
            alpha
          ),
          1e-4
        );

      const t2 =
        t1 +
        Math.max(
          Math.pow(
            dist(
              p1,
              p2
            ),
            alpha
          ),
          1e-4
        );

      const t3 =
        t2 +
        Math.max(
          Math.pow(
            dist(
              p2,
              p3
            ),
            alpha
          ),
          1e-4
        );

      const samples =
        Math.max(
          2,
          Math.round(
            dist(
              p1,
              p2
            ) /
            spacing
          )
        );

      for (
        let s = 0;
        s < samples;
        s++
      ) {

        const t =
          t1 +
          (
            (
              t2 -
              t1
            ) *
            s
          ) /
          samples;

        const a1 =
          mix(
            p0,
            p1,
            (
              t -
              t0
            ) /
            (
              t1 -
              t0
            )
          );

        const a2 =
          mix(
            p1,
            p2,
            (
              t -
              t1
            ) /
            (
              t2 -
              t1
            )
          );

        const a3 =
          mix(
            p2,
            p3,
            (
              t -
              t2
            ) /
            (
              t3 -
              t2
            )
          );

        const b1 =
          mix(
            a1,
            a2,
            (
              t -
              t0
            ) /
            (
              t2 -
              t0
            )
          );

        const b2 =
          mix(
            a2,
            a3,
            (
              t -
              t1
            ) /
            (
              t3 -
              t1
            )
          );

        const c =
          mix(
            b1,
            b2,
            (
              t -
              t1
            ) /
            (
              t2 -
              t1
            )
          );

        res.push(
          new THREE.Vector3(
            c.x,
            0,
            c.y
          )
        );
      }
    }

    return res;
  }


  /* =========================================================
     TRACK DRIVABILITY
     ========================================================= */

  isDrivable(
    loop
  ) {

    const n =
      loop.length;

    if (
      n < 20
    ) {

      return false;
    }

    const k =
      Math.max(
        2,
        Math.round(
          6 /
          this.waypointSpacing
        )
      );

    const minRadius =
      this.laneHalfWidth *
      1.5;

    for (
      let i = 0;
      i < n;
      i++
    ) {

      const a =
        loop[
          (
            i -
            k +
            n
          ) % n
        ];

      const b =
        loop[i];

      const c =
        loop[
          (
            i +
            k
          ) % n
        ];

      const area2 =
        Math.abs(
          (
            b.x -
            a.x
          ) *
          (
            c.z -
            a.z
          ) -
          (
            b.z -
            a.z
          ) *
          (
            c.x -
            a.x
          )
        );

      if (
        area2 <
        1e-6
      ) {

        continue;
      }

      const radius =
        (
          a.distanceTo(b) *
          b.distanceTo(c) *
          c.distanceTo(a)
        ) /
        (
          2 *
          area2
        );

      if (
        radius <
        minRadius
      ) {

        return false;
      }
    }

    return true;
  }


  /* =========================================================
     TRACK TANGENT
     ========================================================= */

  tangentAt(
    i
  ) {

    const w =
      this.waypoints;

    const n =
      w.length;

    return new THREE.Vector3()
      .subVectors(
        w[
          (
            i + 1
          ) % n
        ],
        w[
          (
            i - 1 +
            n
          ) % n
        ]
      )
      .setY(0)
      .normalize();
  }


  /* =========================================================
     TRACK LATERAL
     ========================================================= */

  lateralAt(
    i
  ) {

    const t =
      this.tangentAt(
        i
      );

    return new THREE.Vector3(
      -t.z,
      0,
      t.x
    ).normalize();
  }


  /* =========================================================
     RIBBON
     ========================================================= */

  ribbon(
    loop,
    offsetA,
    offsetB,
    y,
    uvScale = 1
  ) {

    const n =
      loop.length;

    const positions = [];

    const uvs = [];

    const indices = [];

    let distance = 0;

    for (
      let i = 0;
      i <= n;
      i++
    ) {

      const idx =
        i % n;

      const p =
        loop[idx];

      const lat =
        this.lateralAt(
          idx
        );

      if (
        i > 0
      ) {

        distance +=
          p.distanceTo(
            loop[
              (
                idx -
                1 +
                n
              ) % n
            ]
          );
      }

      positions.push(

        p.x +
          lat.x *
          offsetB,

        y,

        p.z +
          lat.z *
          offsetB,

        p.x +
          lat.x *
          offsetA,

        y,

        p.z +
          lat.z *
          offsetA
      );

      uvs.push(
        0,
        (
          distance /
          10
        ) *
        uvScale,

        1,
        (
          distance /
          10
        ) *
        uvScale
      );

      if (
        i < n
      ) {

        const a =
          i * 2;

        const b =
          i * 2 + 1;

        const c =
          i * 2 + 2;

        const d =
          i * 2 + 3;

        indices.push(
          a,
          c,
          b,

          b,
          c,
          d
        );
      }
    }

    const geo =
      new THREE.BufferGeometry();

    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        positions,
        3
      )
    );

    geo.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        uvs,
        2
      )
    );

    geo.setIndex(
      indices
    );

    geo.computeVertexNormals();

    return geo;
  }


  /* =========================================================
     BUILD RACE TRACK
     ========================================================= */

  buildRoadMesh(
    loop
  ) {

    const w =
      this.laneHalfWidth;

    const roadMat =
      new THREE.MeshStandardMaterial({

        color:
          0x0b1220,

        roughness:
          0.85,

        metalness:
          0.2,

        map:
          this.makeRoadTexture()
      });

    const road =
      new THREE.Mesh(

        this.ribbon(
          loop,
          -w,
          w,
          0.02,
          1
        ),

        roadMat
      );

    road.receiveShadow =
      true;

    road.name =
      "RaceRoad";

    road.userData = {
      type:
        "raceTrack"
    };

    this.group.add(
      road
    );


    /* =======================================================
       NEON EDGES
       ======================================================= */

    const edgeLeft =
      new THREE.Mesh(

        this.ribbon(
          loop,
          w - 0.35,
          w + 0.15,
          0.06
        ),

        new THREE.MeshBasicMaterial({
          color:
            0x00eaff
        })
      );

    const edgeRight =
      new THREE.Mesh(

        this.ribbon(
          loop,
          -w - 0.15,
          -w + 0.35,
          0.06
        ),

        new THREE.MeshBasicMaterial({
          color:
            0xff2bd6
        })
      );

    edgeLeft.name =
      "EdgeLeft";

    edgeRight.name =
      "EdgeRight";

    this.group.add(
      edgeLeft,
      edgeRight
    );


    /* =======================================================
       START LINE
       ======================================================= */

    const t =
      this.tangentAt(0);

    const line =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          w * 2,
          0.06,
          1.4
        ),

        new THREE.MeshBasicMaterial({
          color:
            0xffffff
        })
      );

    line.position.set(
      loop[0].x,
      0.07,
      loop[0].z
    );

    line.rotation.y =
      Math.atan2(
        t.x,
        t.z
      );

    line.name =
      "StartLine";

    this.group.add(
      line
    );
  }


  /* =========================================================
     ROAD TEXTURE
     ========================================================= */

  makeRoadTexture() {

    if (
      typeof document ===
      "undefined"
    ) {

      return null;
    }

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      64;

    canvas.height =
      64;

    const ctx =
      canvas.getContext(
        "2d"
      );

    if (!ctx) {

      return null;
    }

    ctx.fillStyle =
      "#ffffff";

    ctx.fillRect(
      0,
      0,
      64,
      64
    );

    ctx.strokeStyle =
      "rgba(0,0,0,0.35)";

    ctx.lineWidth =
      2;

    ctx.strokeRect(
      0,
      0,
      64,
      64
    );

    const tex =
      new THREE.CanvasTexture(
        canvas
      );

    tex.wrapS =
      THREE.RepeatWrapping;

    tex.wrapT =
      THREE.RepeatWrapping;

    tex.repeat.set(
      this.laneHalfWidth / 3,
      1
    );

    tex.colorSpace =
      THREE.SRGBColorSpace;

    return tex;
  }


  /* =========================================================
     TRACK GAMEPLAY OBJECTS
     ========================================================= */

  placeInteractiveZones(
    loop
  ) {

    const n =
      loop.length;

    const colors = [

      {
        name:
          "RED",

        hex:
          0xff2a2a
      },

      {
        name:
          "GREEN",

        hex:
          0x22ff66
      },

      {
        name:
          "BLUE",

        hex:
          0x2a7bff
      }
    ];

    const arc =
      [0];

    for (
      let i = 1;
      i < n;
      i++
    ) {

      arc.push(
        arc[i - 1] +
        loop[i].distanceTo(
          loop[i - 1]
        )
      );
    }

    const total =
      arc[n - 1] +
      loop[n - 1].distanceTo(
        loop[0]
      );

    const indexAtDistance =
      distance => {

        let lo = 0;

        let hi =
          n - 1;

        while (
          lo < hi
        ) {

          const mid =
            (
              lo +
              hi
            ) >> 1;

          if (
            arc[mid] <
            distance
          ) {

            lo =
              mid + 1;

          } else {

            hi =
              mid;
          }
        }

        return lo;
      };

    let slot = 0;

    for (
      let d =
        this.zoneStartOffset;

      d <
        total -
        this.zoneStartOffset;

      d +=
        this.zoneSpacing,

      slot++
    ) {

      const color =
        colors[
          slot %
          colors.length
        ];

      this.addColorZone(
        loop,
        indexAtDistance(d),
        color
      );

      const half =
        d +
        this.zoneSpacing *
        0.5;

      if (
        half <
        total -
        this.zoneStartOffset *
        0.5
      ) {

        this.addSpeedBoost(
          loop,
          indexAtDistance(
            half
          )
        );
      }

      const quarter =
        d +
        this.zoneSpacing *
        0.25;

      if (
        slot % 2 === 1 &&
        quarter <
        total -
        this.zoneStartOffset *
        0.5
      ) {

        this.addRamp(
          loop,
          indexAtDistance(
            quarter
          )
        );
      }
    }
  }


  orientToTrack(
    obj,
    i
  ) {

    const t =
      this.tangentAt(i);

    obj.rotation.y =
      Math.atan2(
        t.x,
        t.z
      );
  }


  addColorZone(
    loop,
    i,
    color
  ) {

    const w =
      this.laneHalfWidth;

    const mesh =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          w * 1.8,
          0.1,
          3
        ),

        new THREE.MeshBasicMaterial({

          color:
            color.hex,

          transparent:
            true,

          opacity:
            0.85
        })
      );

    mesh.position.set(
      loop[i].x,
      0.1,
      loop[i].z
    );

    this.orientToTrack(
      mesh,
      i
    );

    mesh.name =
      `ColorZone_${color.name}`;

    mesh.userData = {

      type:
        "colorZone",

      color:
        color.name,

      boostColor:
        color.hex,

      active:
        true
    };

    this.group.add(
      mesh
    );

    this.zones.push(
      mesh
    );
  }


  addSpeedBoost(
    loop,
    i
  ) {

    const w =
      this.laneHalfWidth;

    const mesh =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          w * 1.2,
          0.3,
          4
        ),

        new THREE.MeshBasicMaterial({
          color:
            0xffe14a
        })
      );

    mesh.position.set(
      loop[i].x,
      0.15,
      loop[i].z
    );

    this.orientToTrack(
      mesh,
      i
    );

    mesh.name =
      "SpeedBoost";

    mesh.userData = {

      type:
        "speedBoost",

      active:
        true
    };

    this.group.add(
      mesh
    );

    this.zones.push(
      mesh
    );
  }


  addRamp(
    loop,
    i
  ) {

    const w =
      this.laneHalfWidth;

    const pivot =
      new THREE.Group();

    pivot.position.set(
      loop[i].x,
      0,
      loop[i].z
    );

    this.orientToTrack(
      pivot,
      i
    );

    const length = 7;

    const angle = 0.22;

    const slab =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          w * 1.3,
          0.4,
          length
        ),

        new THREE.MeshStandardMaterial({

          color:
            0x1a2a44,

          emissive:
            0xff8a00,

          emissiveIntensity:
            0.6,

          roughness:
            0.5
        })
      );

    slab.rotation.x =
      -angle;

    slab.position.y =
      (
        length / 2
      ) *
      Math.sin(
        angle
      ) +
      0.1;

    slab.castShadow =
      true;

    slab.receiveShadow =
      true;

    pivot.add(
      slab
    );

    pivot.name =
      "JumpRamp";

    pivot.userData = {

      type:
        "ramp"
    };

    this.group.add(
      pivot
    );

    this.ramps.push(
      pivot
    );
  }


  /* =========================================================
     WORLD BACKGROUND
     ========================================================= */

  buildBackground() {

    /* -------------------------------------------------------
       FLOOR
       ------------------------------------------------------- */

    const floor =
      new THREE.Mesh(

        new THREE.PlaneGeometry(
          1400,
          1400
        ),

        new THREE.MeshStandardMaterial({

          color:
            0x02050b,

          roughness:
            1,

          metalness:
            0
        })
      );

    floor.rotation.x =
      -Math.PI / 2;

    floor.position.y =
      -0.1;

    floor.receiveShadow =
      true;

    floor.name =
      "WorldFloor";

    floor.userData = {

      type:
        "worldFloor"
    };

    this.group.add(
      floor
    );


    /* -------------------------------------------------------
       GRID
       ------------------------------------------------------- */

    const grid =
      new THREE.GridHelper(
        1400,
        140,
        0x0a6a9a,
        0x0a2a44
      );

    grid.position.y =
      -0.04;

    grid.name =
      "WorldGrid";

    this.group.add(
      grid
    );


    /* -------------------------------------------------------
       MAKE CITY MORE VISIBLE
       ------------------------------------------------------- */

    if (
      this.scene.fog
    ) {

      this.scene.fog.near =
        90;

      this.scene.fog.far =
        650;
    }
  }


  /* =========================================================
     STEP 2 — CITY
     ========================================================= */

  buildCity(
    loop
  ) {

    this.buildCityStreets();

    this.buildCitySidewalks();

    /* Parking lots are built per block inside buildCityBlocks() */
    this.buildCityBlocks();

    this.buildDestinations();

    this.buildStreetLights();
  }


  /* =========================================================
     STREET MATERIAL
     ========================================================= */

  createStreetMaterial() {

    return new THREE.MeshStandardMaterial({

      color:
        0x171b22,

      roughness:
        0.9,

      metalness:
        0.05
    });
  }


  /* =========================================================
     SIDEWALK MATERIAL
     ========================================================= */

  createSidewalkMaterial() {

    return new THREE.MeshStandardMaterial({

      color:
        0x555a61,

      roughness:
        0.95,

      metalness:
        0
    });
  }


  /* =========================================================
     CITY STREETS
     ========================================================= */

  buildCityStreets() {

    const material =
      this.createStreetMaterial();

    const half =
      this.citySize / 2;

    const spacing =
      this.cityBlockSize +
      this.streetWidth;

    /* =======================================================
       EAST / WEST
       ======================================================= */

    for (
      let z =
        -half;
      z <= half;
      z += spacing
    ) {

      const street =
        new THREE.Mesh(

          new THREE.BoxGeometry(

            this.citySize,

            0.08,

            this.streetWidth
          ),

          material
        );

      street.position.set(
        0,
        0.01,
        z
      );

      street.receiveShadow =
        true;

      street.name =
        "CityStreet_EW";

      street.userData = {

        type:
          "street",

        direction:
          "east-west",

        drivable:
          true,

        collision:
          false
      };

      this.group.add(
        street
      );

      this.streets.push(
        street
      );

      this.addLaneMarkers(
        "horizontal",
        z
      );
    }


    /* =======================================================
       NORTH / SOUTH
       ======================================================= */

    for (
      let x =
        -half;
      x <= half;
      x += spacing
    ) {

      const street =
        new THREE.Mesh(

          new THREE.BoxGeometry(

            this.streetWidth,

            0.08,

            this.citySize
          ),

          material
        );

      street.position.set(
        x,
        0.02,
        0
      );

      street.receiveShadow =
        true;

      street.name =
        "CityStreet_NS";

      street.userData = {

        type:
          "street",

        direction:
          "north-south",

        drivable:
          true,

        collision:
          false
      };

      this.group.add(
        street
      );

      this.streets.push(
        street
      );

      this.addLaneMarkers(
        "vertical",
        x
      );
    }
  }


  /* =========================================================
     LANE MARKERS
     ========================================================= */

  addLaneMarkers(
    direction,
    position
  ) {

    const material =
      new THREE.MeshBasicMaterial({

        color:
          0x8b8f96
      });

    const markerLength = 4;

    const markerWidth = 0.16;

    const cityHalf =
      this.citySize / 2;

    if (
      direction ===
      "horizontal"
    ) {

      for (
        let x =
          -cityHalf;
        x <
          cityHalf;
        x += 14
      ) {

        const marker =
          new THREE.Mesh(

            new THREE.BoxGeometry(

              markerLength,

              0.025,

              markerWidth
            ),

            material
          );

        marker.position.set(
          x,
          0.065,
          position
        );

        marker.userData = {

          type:
            "laneMarker"
        };

        this.group.add(
          marker
        );
      }

    } else {

      for (
        let z =
          -cityHalf;
        z <
          cityHalf;
        z += 14
      ) {

        const marker =
          new THREE.Mesh(

            new THREE.BoxGeometry(

              markerWidth,

              0.025,

              markerLength
            ),

            material
          );

        marker.position.set(
          position,
          0.07,
          z
        );

        marker.userData = {

          type:
            "laneMarker"
        };

        this.group.add(
          marker
        );
      }
    }
  }


  /* =========================================================
     SIDEWALKS
     
     IMPORTANT:
     Sidewalks are now placed BESIDE the road.
     They no longer cover the entire street.
     ========================================================= */

  buildCitySidewalks() {

    const material =
      this.createSidewalkMaterial();

    const half =
      this.citySize / 2;

    const spacing =
      this.cityBlockSize +
      this.streetWidth;

    const sidewalk =
      this.sidewalkWidth;

    /* =======================================================
       EAST / WEST STREET SIDEWALKS
       ======================================================= */

    for (
      let z =
        -half;
      z <= half;
      z += spacing
    ) {

      const north =
        new THREE.Mesh(

          new THREE.BoxGeometry(

            this.citySize,

            0.14,

            sidewalk
          ),

          material
        );

      north.position.set(
        0,
        0.075,
        z +
          this.streetWidth / 2 +
          sidewalk / 2
      );

      north.name =
        "Sidewalk_EW_North";

      north.userData = {

        type:
          "sidewalk",

        drivable:
          false
      };

      north.receiveShadow =
        true;

      this.group.add(
        north
      );

      this.sidewalks.push(
        north
      );


      const south =
        new THREE.Mesh(

          new THREE.BoxGeometry(

            this.citySize,

            0.14,

            sidewalk
          ),

          material
        );

      south.position.set(
        0,
        0.075,
        z -
          this.streetWidth / 2 -
          sidewalk / 2
      );

      south.name =
        "Sidewalk_EW_South";

      south.userData = {

        type:
          "sidewalk",

        drivable:
          false
      };

      south.receiveShadow =
        true;

      this.group.add(
        south
      );

      this.sidewalks.push(
        south
      );
    }


    /* =======================================================
       NORTH / SOUTH STREET SIDEWALKS
       ======================================================= */

    for (
      let x =
        -half;
      x <= half;
      x += spacing
    ) {

      const east =
        new THREE.Mesh(

          new THREE.BoxGeometry(

            sidewalk,

            0.14,

            this.citySize
          ),

          material
        );

      east.position.set(
        x +
          this.streetWidth / 2 +
          sidewalk / 2,

        0.08,

        0
      );

      east.name =
        "Sidewalk_NS_East";

      east.userData = {

        type:
          "sidewalk",

        drivable:
          false
      };

      east.receiveShadow =
        true;

      this.group.add(
        east
      );

      this.sidewalks.push(
        east
      );


      const west =
        new THREE.Mesh(

          new THREE.BoxGeometry(

            sidewalk,

            0.14,

            this.citySize
          ),

          material
        );

      west.position.set(
        x -
          this.streetWidth / 2 -
          sidewalk / 2,

        0.08,

        0
      );

      west.name =
        "Sidewalk_NS_West";

      west.userData = {

        type:
          "sidewalk",

        drivable:
          false
      };

      west.receiveShadow =
        true;

      this.group.add(
        west
      );

      this.sidewalks.push(
        west
      );
    }
  }


  /* =========================================================
     CITY BLOCKS
     ========================================================= */

  buildCityBlocks() {

    const half =
      this.citySize / 2;

    const spacing =
      this.cityBlockSize +
      this.streetWidth;

    let blockNumber = 0;

    for (
      let x =
        -half +
        spacing / 2;

      x <
        half;

      x += spacing
    ) {

      for (
        let z =
          -half +
          spacing / 2;

        z <
          half;

        z += spacing
      ) {

        blockNumber++;

        this.buildBlock(
          x,
          z,
          blockNumber
        );
      }
    }
  }


  /* =========================================================
     BUILD ONE CITY BLOCK
     ========================================================= */

  buildBlock(
    centerX,
    centerZ,
    blockNumber
  ) {

    const block =
      new THREE.Group();

    block.name =
      `CityBlock_${blockNumber}`;

    block.userData = {

      type:
        "cityBlock",

      blockId:
        blockNumber
    };


    const size =
      this.cityBlockSize;

    const usable =
      size -
      this.buildingGap *
      2;


    /* =======================================================
       OPEN LOT
       ======================================================= */

    if (
      Math.random() <
      0.15
    ) {

      this.buildOpenLot(
        centerX,
        centerZ,
        blockNumber
      );

      this.group.add(
        block
      );

      return;
    }


    /* =======================================================
       BUILDINGS
       ======================================================= */

    const positions = [

      [
        -usable / 4,
        -usable / 4
      ],

      [
        usable / 4,
        -usable / 4
      ],

      [
        -usable / 4,
        usable / 4
      ],

      [
        usable / 4,
        usable / 4
      ]
    ];


    positions.forEach(
      (
        pos,
        index
      ) => {

        const width =
          usable / 2 -
          this.buildingGap;

        const depth =
          usable / 2 -
          this.buildingGap;

        this.createBuilding(

          centerX +
            pos[0],

          centerZ +
            pos[1],

          width,

          depth,

          index,

          blockNumber
        );
      }
    );


    this.group.add(
      block
    );
  }


  /* =========================================================
     BUILDING TYPE
     ========================================================= */

  getBuildingType(
    blockNumber,
    index
  ) {

    const special =
      (
        blockNumber +
        index
      ) % 10;


    switch (
      special
    ) {

      case 0:
        return "auto_shop";

      case 1:
        return "record_store";

      case 2:
        return "restaurant";

      case 3:
        return "clothing_store";

      case 4:
        return "radio_station";

      case 5:
        return "warehouse";

      case 6:
        return "office";

      case 7:
        return "apartment";

      case 8:
        return "bank";

      default:
        return "business";
    }
  }


  /* =========================================================
     CREATE BUILDING
     ========================================================= */

  createBuilding(
    x,
    z,
    width,
    depth,
    index,
    blockNumber,
    forcedType = null
  ) {

    const type =
      forcedType ||
      this.getBuildingType(
        blockNumber,
        index
      );

    const height =
      this.getBuildingHeight(
        type
      );

    const material =
      this.getBuildingMaterial(
        type
      );

    const building =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          width,
          height,
          depth
        ),

        material
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


    building.name =
      `Building_${type}_${blockNumber}_${index}`;


    /* =======================================================
       FUTURE COLLISION / INTERIOR DATA
       ======================================================= */

    building.userData = {

      type:
        "building",

      buildingType:
        type,

      buildingId:
        `${blockNumber}_${index}`,

      blockId:
        blockNumber,

      enterable:
        false,

      collision:
        false,

      hasInterior:
        false,

      label:
        this.getBuildingLabel(
          type
        )
    };


    this.group.add(
      building
    );

    this.buildings.push(
      building
    );


    return building;
  }


  /* =========================================================
     BUILDING HEIGHT
     ========================================================= */

  getBuildingHeight(
    type
  ) {

    switch (
      type
    ) {

      case "warehouse":
        return 12;

      case "auto_shop":
        return 9;

      case "restaurant":
        return 8;

      case "record_store":
        return 7;

      case "clothing_store":
        return 8;

      case "radio_station":
        return 16;

      case "bank":
        return 13;

      case "office":
        return 24;

      case "apartment":
        return 30;

      default:

        return (
          this.buildingMinHeight +
          Math.random() *
          (
            this.buildingMaxHeight -
            this.buildingMinHeight
          )
        );
    }
  }


  /* =========================================================
     BUILDING MATERIAL
     ========================================================= */

  getBuildingMaterial(
    type
  ) {

    const colors = {

      auto_shop:
        0x26384a,

      record_store:
        0x33253c,

      restaurant:
        0x473326,

      clothing_store:
        0x263c3c,

      radio_station:
        0x222c45,

      warehouse:
        0x30353b,

      office:
        0x242b38,

      apartment:
        0x35343d,

      bank:
        0x394036,

      business:
        0x252a34
    };


    const color =
      colors[type] ||
      colors.business;


    return new THREE.MeshStandardMaterial({

      color,

      roughness:
        0.75,

      metalness:
        0.15
    });
  }


  /* =========================================================
     BUILDING LABEL
     ========================================================= */

  getBuildingLabel(
    type
  ) {

    const labels = {

      auto_shop:
        "AUTO SHOP",

      record_store:
        "RECORD STORE",

      restaurant:
        "RESTAURANT",

      clothing_store:
        "CLOTHING STORE",

      radio_station:
        "RADIO STATION",

      warehouse:
        "WAREHOUSE",

      office:
        "OFFICE",

      apartment:
        "APARTMENTS",

      bank:
        "BANK",

      business:
        "BUSINESS"
    };


    return (
      labels[type] ||
      "BUSINESS"
    );
  }


  /* =========================================================
     OPEN PARKING LOT
     ========================================================= */

  buildOpenLot(
    x,
    z,
    blockNumber
  ) {

    const lot =
      new THREE.Mesh(

        new THREE.BoxGeometry(

          this.cityBlockSize - 8,

          0.08,

          this.cityBlockSize - 8
        ),

        new THREE.MeshStandardMaterial({

          color:
            0x24272b,

          roughness:
            0.95
        })
      );


    lot.position.set(
      x,
      0.06,
      z
    );


    lot.name =
      `ParkingLot_${blockNumber}`;


    lot.userData = {

      type:
        "parkingLot",

      blockId:
        blockNumber,

      drivable:
        true
    };


    this.group.add(
      lot
    );

    this.parkingLots.push(
      lot
    );


    this.addParkingSpaces(
      x,
      z
    );
  }


  /* =========================================================
     PARKING SPACES
     ========================================================= */

  addParkingSpaces(
    centerX,
    centerZ
  ) {

    const material =
      new THREE.MeshBasicMaterial({

        color:
          0x777777
      });


    for (
      let x =
        centerX - 18;

      x <=
        centerX + 18;

      x += 9
    ) {

      const line =
        new THREE.Mesh(

          new THREE.BoxGeometry(
            0.12,
            0.025,
            5
          ),

          material
        );


      line.position.set(
        x,
        0.12,
        centerZ
      );


      line.userData = {

        type:
          "parkingSpace"
      };


      this.group.add(
        line
      );
    }
  }


  /* =========================================================
     DESTINATIONS
     ========================================================= */

  buildDestinations() {

    const destinations = [

      {
        type:
          "auto_shop",

        label:
          "AUTO SHOP",

        x:
          -156,

        z:
          -156,

        width:
          24,

        depth:
          18
      },

      {
        type:
          "record_store",

        label:
          "RECORD STORE",

        x:
          156,

        z:
          -156,

        width:
          20,

        depth:
          18
      },

      {
        type:
          "restaurant",

        label:
          "RESTAURANT",

        x:
          -156,

        z:
          156,

        width:
          22,

        depth:
          18
      },

      {
        type:
          "clothing_store",

        label:
          "CLOTHING STORE",

        x:
          156,

        z:
          156,

        width:
          24,

        depth:
          18
      },

      {
        type:
          "radio_station",

        label:
          "RADIO STATION",

        x:
          0,

        z:
          -208,

        width:
          30,

        depth:
          20
      },

      {
        type:
          "bank",

        label:
          "BANK",

        x:
          0,

        z:
          208,

        width:
          22,

        depth:
          18
      }
    ];


    destinations.forEach(
      (
        destination,
        index
      ) => {

        const building =
          this.createBuilding(

            destination.x,

            destination.z,

            destination.width,

            destination.depth,

            index,

            9000 + index,

            destination.type
          );


        building.userData.destination =
          true;

        building.userData.enterable =
          false;

        building.userData.hasInterior =
          false;

        building.userData.label =
          destination.label;


        this.destinations.push(
          building
        );


        this.addDestinationSign(
          building,
          destination.label
        );
      }
    );
  }


  /* =========================================================
     DESTINATION SIGN
     ========================================================= */

  addDestinationSign(
    building,
    label
  ) {

    const width =
      building.geometry
        .parameters
        .width;


    const depth =
      building.geometry
        .parameters
        .depth;


    const sign =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          Math.min(
            width * 0.8,
            12
          ),
          1.4,
          0.35
        ),

        new THREE.MeshBasicMaterial({

          color:
            0x00eaff
        })
      );


    /*
      Put the sign on the front side
      of the building.
    */

    sign.position.set(

      building.position.x,

      building.position.y +
        2.5,

      building.position.z -
        depth / 2 -
        0.25
    );


    sign.name =
      `DestinationSign_${label}`;


    sign.userData = {

      type:
        "destinationSign",

      destination:
        label
    };


    this.group.add(
      sign
    );
  }


  /* =========================================================
     STREET LIGHTS
     ========================================================= */

  buildStreetLights() {

    const spacing =
      this.cityBlockSize +
      this.streetWidth;

    const half =
      this.citySize / 2;

    const postMaterial =
      new THREE.MeshStandardMaterial({

        color:
          0x1b1f26,

        roughness:
          0.7,

        metalness:
          0.4
      });


    const lightMaterial =
      new THREE.MeshBasicMaterial({

        color:
          0x9eeeff
      });


    /*
      Keep this deliberately sparse.
      We do not want hundreds of
      shadow-casting lights.
    */

    for (
      let x =
        -half;
      x <= half;
      x += spacing * 2
    ) {

      for (
        let z =
          -half;
        z <= half;
        z += spacing * 2
      ) {

        this.addStreetLight(
          x +
            this.streetWidth,

          z +
            this.streetWidth,

          postMaterial,

          lightMaterial
        );
      }
    }
  }


  /* =========================================================
     SINGLE STREET LIGHT
     ========================================================= */

  addStreetLight(
    x,
    z,
    postMaterial,
    lightMaterial
  ) {

    const group =
      new THREE.Group();


    const post =
      new THREE.Mesh(

        new THREE.CylinderGeometry(
          0.12,
          0.16,
          4,
          8
        ),

        postMaterial
      );


    post.position.y =
      2;


    group.add(
      post
    );


    const arm =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          1.2,
          0.12,
          0.12
        ),

        postMaterial
      );


    arm.position.set(
      0.5,
      3.7,
      0
    );


    group.add(
      arm
    );


    const lamp =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          0.35,
          0.15,
          0.35
        ),

        lightMaterial
      );


    lamp.position.set(
      1.05,
      3.6,
      0
    );


    group.add(
      lamp
    );


    group.position.set(
      x,
      0,
      z
    );


    group.name =
      "StreetLight";


    group.userData = {

      type:
        "streetLight"
    };


    this.group.add(
      group
    );
  }


  /* =========================================================
     WINDOW TEXTURE
     ========================================================= */

  makeWindowTexture() {

    if (
      typeof document ===
      "undefined"
    ) {

      return null;
    }


    const canvas =
      document.createElement(
        "canvas"
      );


    canvas.width =
      64;

    canvas.height =
      128;


    const ctx =
      canvas.getContext(
        "2d"
      );


    if (!ctx) {

      return null;
    }


    ctx.fillStyle =
      "#05070b";

    ctx.fillRect(
      0,
      0,
      64,
      128
    );


    for (
      let y = 5;
      y < 124;
      y += 10
    ) {

      for (
        let x = 5;
        x < 60;
        x += 10
      ) {

        if (
          Math.random() <
          0.5
        ) {

          ctx.fillStyle =
            "#ffffff";

          ctx.fillRect(
            x,
            y,
            5,
            6
          );
        }
      }
    }


    const tex =
      new THREE.CanvasTexture(
        canvas
      );


    tex.colorSpace =
      THREE.SRGBColorSpace;


    return tex;
  }
}


/* =========================================================
   EXPOSE CLASS
   ========================================================= */

if (
  typeof window !==
  "undefined"
) {

  window.TrackGenerator =
    TrackGenerator;
}
