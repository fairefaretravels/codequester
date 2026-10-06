/* =========================================================
   CODEQUESTER — TRACK GENERATOR
   Three.js r156 port of the Unity TrackGenerator scaffold.

   Pipeline:
     1) scatter points around a ring
     2) convex hull        (keeps the loop from crossing itself)
     3) closed Catmull-Rom (smooth centerline)
     4) road ribbon + neon edges + start line
     5) color zones, speed boosts, jump ramps
     6) digital grid floor + low-poly neon skyline

   Interface used by main.js:
     const track     = new TrackGenerator(scene);
     const waypoints = track.generate();   // THREE.Vector3[] (closed loop)
     track.laneHalfWidth                   // half the road width
     track.zones                           // colorZone / speedBoost meshes
     track.ramps                           // jump ramp objects
   ========================================================= */
class TrackGenerator {
  constructor(scene, options = {}) {
    this.scene = scene;

    /* Track */
    this.pointCount = 24;
    this.radiusMin = 60;
    this.radiusMax = 90;
    this.laneHalfWidth = 6;
    this.waypointSpacing = 2;      // world units between waypoints

    /* Zones (distances in world units along the track) */
    this.zoneSpacing = 120;
    this.zoneStartOffset = 60;

    Object.assign(this, options);

    this.waypoints = [];
    this.zones = [];
    this.ramps = [];
    this.group = new THREE.Group();
    this.group.name = "CodeQuestER_Track";
  }

  /* -------------------------------------------------------
     PUBLIC
     ------------------------------------------------------- */
  generate() {
    this.dispose();

    /*
      Keep generating until the loop is actually drivable:
      no self-crossing and no corner tighter than the road
      is wide (otherwise the road ribbon folds over itself).
    */
    let loop = null;
    for (let attempt = 0; attempt < 60 && !loop; attempt++) {
      const pts = this.scatterPoints(
        this.pointCount,
        this.radiusMin,
        this.radiusMax
      );
      const hull = this.convexHull(pts);
      if (hull.length < 8) continue;

      const candidate = this.catmullRomClosed(
        this.chaikin(hull),
        this.waypointSpacing
      );
      if (this.isDrivable(candidate)) loop = candidate;
    }
    if (!loop) {
      loop = this.catmullRomClosed(
        this.fallbackLoop(),
        this.waypointSpacing
      );
    }

    this.waypoints = loop;

    this.scene.add(this.group);
    this.buildRoadMesh(this.waypoints);
    this.placeInteractiveZones(this.waypoints);
    this.buildBackground(this.waypoints);

    return this.waypoints;
  }

  dispose() {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose());
      }
    });
    this.group.clear();
    this.zones = [];
    this.ramps = [];
    this.waypoints = [];
  }

  /* -------------------------------------------------------
     1) SCATTER
     Evenly spaced angles with jitter, random radius in the
     ring, so the hull always has plenty of corners.
     ------------------------------------------------------- */
  scatterPoints(n, r0, r1) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const angle = ((i + Math.random() * 0.7) / n) * Math.PI * 2;
      const radius = r0 + Math.random() * (r1 - r0);
      pts.push(new THREE.Vector2(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      ));
    }
    return pts;
  }

  /* -------------------------------------------------------
     2) CONVEX HULL (monotone chain, counter-clockwise)
     ------------------------------------------------------- */
  convexHull(points) {
    const pts = points
      .map(p => p.clone())
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;

    const cross = (o, a, b) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (const p of pts) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
      ) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
      ) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /* Used only if random scattering somehow never gives a good hull. */
  fallbackLoop() {
    const pts = [];
    const n = 12;
    const r = (this.radiusMin + this.radiusMax) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    return pts;
  }

  /* -------------------------------------------------------
     2b) CORNER CUTTING (Chaikin)
     Rounds off the sharp hull corners so the road can turn
     them. A convex polygon stays convex.
     ------------------------------------------------------- */
  chaikin(poly) {
    const out = [];
    const m = poly.length;
    for (let i = 0; i < m; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % m];
      out.push(
        new THREE.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25),
        new THREE.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75)
      );
    }
    return out;
  }

  /* -------------------------------------------------------
     3) CATMULL-ROM, CLOSED (centripetal, alpha = 0.5)
     Centripetal parameterization avoids the overshoots and
     loops of the uniform version on unevenly spaced points.
     Samples are spaced by distance, so waypoints are evenly
     distributed around the loop. Returns Vector3 on the XZ
     plane (y = 0).
     ------------------------------------------------------- */
  catmullRomClosed(pts, spacing) {
    const res = [];
    const m = pts.length;
    const alpha = 0.5;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mix = (a, b, w) => ({
      x: a.x * (1 - w) + b.x * w,
      y: a.y * (1 - w) + b.y * w
    });

    for (let i = 0; i < m; i++) {
      const p0 = pts[(i - 1 + m) % m];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % m];
      const p3 = pts[(i + 2) % m];

      const t0 = 0;
      const t1 = t0 + Math.max(Math.pow(dist(p0, p1), alpha), 1e-4);
      const t2 = t1 + Math.max(Math.pow(dist(p1, p2), alpha), 1e-4);
      const t3 = t2 + Math.max(Math.pow(dist(p2, p3), alpha), 1e-4);

      const samples = Math.max(2, Math.round(dist(p1, p2) / spacing));

      for (let s = 0; s < samples; s++) {
        const t = t1 + ((t2 - t1) * s) / samples;

        const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
        const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
        const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
        const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
        const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
        const c = mix(b1, b2, (t - t1) / (t2 - t1));

        res.push(new THREE.Vector3(c.x, 0, c.y));
      }
    }
    return res;
  }

  /* -------------------------------------------------------
     Is the loop usable as a road?
       - no corner with a radius smaller than 1.5 x half-width
       - centerline never crosses itself
     ------------------------------------------------------- */
  isDrivable(loop) {
    const n = loop.length;
    if (n < 20) return false;

    const k = Math.max(2, Math.round(6 / this.waypointSpacing));
    const minRadius = this.laneHalfWidth * 1.5;

    for (let i = 0; i < n; i++) {
      const a = loop[(i - k + n) % n];
      const b = loop[i];
      const c = loop[(i + k) % n];
      const area2 = Math.abs(
        (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
      );
      if (area2 < 1e-6) continue; // effectively straight
      const radius =
        (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) /
        (2 * area2);
      if (radius < minRadius) return false;
    }

    /*
      Exact fold test, mirroring how the ribbon is built:
      offset every waypoint sideways by the road reach and make
      sure the offset edge still moves forward with the centerline.
    */
    const reach = this.laneHalfWidth + 0.5;
    const nx = new Array(n);
    const nz = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = loop[(i - 1 + n) % n];
      const q = loop[(i + 1) % n];
      const len = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      nx[i] = -(q.z - p.z) / len;
      nz[i] = (q.x - p.x) / len;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const sx = loop[j].x - loop[i].x;
      const sz = loop[j].z - loop[i].z;
      const stepSq = sx * sx + sz * sz;
      for (const side of [-1, 1]) {
        const ex = loop[j].x + nx[j] * reach * side - (loop[i].x + nx[i] * reach * side);
        const ez = loop[j].z + nz[j] * reach * side - (loop[i].z + nz[i] * reach * side);
        if (ex * sx + ez * sz < 0.15 * stepSq) return false;
      }
    }

    const orient = (p, q, r) =>
      (r.z - p.z) * (q.x - p.x) - (q.z - p.z) * (r.x - p.x);
    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = loop[j];
        const d = loop[(j + 1) % n];
        if (
          orient(a, c, d) * orient(b, c, d) < 0 &&
          orient(a, b, c) * orient(a, b, d) < 0
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /* -------------------------------------------------------
     Helpers: tangent / lateral normal / arc length
     ------------------------------------------------------- */
  tangentAt(i) {
    const w = this.waypoints;
    const n = w.length;
    return new THREE.Vector3()
      .subVectors(w[(i + 1) % n], w[(i - 1 + n) % n])
      .setY(0)
      .normalize();
  }

  lateralAt(i) {
    const t = this.tangentAt(i);
    return new THREE.Vector3(-t.z, 0, t.x);
  }

  /* Flat strip between two lateral offsets, facing up. */
  ribbon(loop, offsetA, offsetB, y, uvScale = 1) {
    const n = loop.length;
    const positions = [];
    const uvs = [];
    const indices = [];
    let dist = 0;

    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const p = loop[idx];
      const lat = this.lateralAt(idx);

      if (i > 0) {
        dist += p.distanceTo(loop[(idx - 1 + n) % n]);
      }

      positions.push(
        p.x + lat.x * offsetB, y, p.z + lat.z * offsetB,
        p.x + lat.x * offsetA, y, p.z + lat.z * offsetA
      );
      uvs.push(0, (dist / 10) * uvScale, 1, (dist / 10) * uvScale);

      if (i < n) {
        const a = i * 2;       // +lateral side, this row
        const b = i * 2 + 1;   // -lateral side, this row
        const c = i * 2 + 2;   // +lateral side, next row
        const d = i * 2 + 3;   // -lateral side, next row
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /* -------------------------------------------------------
     4) ROAD MESH
     ------------------------------------------------------- */
  buildRoadMesh(loop) {
    const w = this.laneHalfWidth;

    /* Asphalt with a faint grid texture */
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      roughness: 0.85,
      metalness: 0.2,
      map: this.makeRoadTexture()
    });
    const road = new THREE.Mesh(this.ribbon(loop, -w, w, 0.02, 1), roadMat);
    road.receiveShadow = true;
    road.name = "Road";
    this.group.add(road);

    /* Neon edges */
    const edgeLeftMat = new THREE.MeshBasicMaterial({ color: 0x00eaff });
    const edgeRightMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
    const edgeL = new THREE.Mesh(
      this.ribbon(loop, w - 0.35, w + 0.15, 0.06),
      edgeLeftMat
    );
    const edgeR = new THREE.Mesh(
      this.ribbon(loop, -w - 0.15, -w + 0.35, 0.06),
      edgeRightMat
    );
    edgeL.name = "EdgeLeft";
    edgeR.name = "EdgeRight";
    this.group.add(edgeL, edgeR);

    /* Start / finish line across the road at waypoint 0 */
    const t = this.tangentAt(0);
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(w * 2, 0.06, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    line.position.set(loop[0].x, 0.07, loop[0].z);
    line.rotation.y = Math.atan2(t.x, t.z);
    line.name = "StartLine";
    this.group.add(line);
  }

  makeRoadTexture() {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.laneHalfWidth / 3, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* -------------------------------------------------------
     5) INTERACTIVE ZONES
     Cycles RED / GREEN / BLUE every zoneSpacing units, puts a
     speed boost halfway between them, and a ramp on every
     other gap. Nothing is placed right on the start line.
     ------------------------------------------------------- */
  placeInteractiveZones(loop) {
    const n = loop.length;

    const colors = [
      { name: "RED", hex: 0xff2a2a },
      { name: "GREEN", hex: 0x22ff66 },
      { name: "BLUE", hex: 0x2a7bff }
    ];

    /* Cumulative arc length at each waypoint */
    const arc = [0];
    for (let i = 1; i < n; i++) {
      arc.push(arc[i - 1] + loop[i].distanceTo(loop[i - 1]));
    }
    const total = arc[n - 1] + loop[n - 1].distanceTo(loop[0]);

    const indexAtDistance = d => {
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arc[mid] < d) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    let slot = 0;
    for (
      let d = this.zoneStartOffset;
      d < total - this.zoneStartOffset;
      d += this.zoneSpacing, slot++
    ) {
      const color = colors[slot % colors.length];
      this.addColorZone(loop, indexAtDistance(d), color);

      const half = d + this.zoneSpacing * 0.5;
      if (half < total - this.zoneStartOffset * 0.5) {
        this.addSpeedBoost(loop, indexAtDistance(half));
      }

      const quarter = d + this.zoneSpacing * 0.25;
      if (slot % 2 === 1 && quarter < total - this.zoneStartOffset * 0.5) {
        this.addRamp(loop, indexAtDistance(quarter));
      }
    }
  }

  orientToTrack(obj, i) {
    const t = this.tangentAt(i);
    obj.rotation.y = Math.atan2(t.x, t.z);
  }

  addColorZone(loop, i, color) {
    const w = this.laneHalfWidth;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.8, 0.1, 3),
      new THREE.MeshBasicMaterial({
        color: color.hex,
        transparent: true,
        opacity: 0.85
      })
    );
    mesh.position.set(loop[i].x, 0.1, loop[i].z);
    this.orientToTrack(mesh, i);
    mesh.name = `ColorZone_${color.name}`;
    mesh.userData = {
      type: "colorZone",
      color: color.name,
      boostColor: color.hex,
      active: true
    };
    this.group.add(mesh);
    this.zones.push(mesh);
  }

  addSpeedBoost(loop, i) {
    const w = this.laneHalfWidth;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.2, 0.3, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe14a })
    );
    mesh.position.set(loop[i].x, 0.15, loop[i].z);
    this.orientToTrack(mesh, i);
    mesh.name = "SpeedBoost";
    mesh.userData = {
      type: "speedBoost",
      active: true
    };
    this.group.add(mesh);
    this.zones.push(mesh);
  }

  addRamp(loop, i) {
    const w = this.laneHalfWidth;
    const pivot = new THREE.Group();
    pivot.position.set(loop[i].x, 0, loop[i].z);
    this.orientToTrack(pivot, i);

    const length = 7;
    const angle = 0.22;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.3, 0.4, length),
      new THREE.MeshStandardMaterial({
        color: 0x1a2a44,
        emissive: 0xff8a00,
        emissiveIntensity: 0.6,
        roughness: 0.5
      })
    );
    /* Rise toward the direction of travel (local +Z). */
    slab.rotation.x = -angle;
    slab.position.y = (length / 2) * Math.sin(angle) + 0.1;
    slab.castShadow = true;
    slab.receiveShadow = true;
    pivot.add(slab);

    pivot.name = "JumpRamp";
    this.group.add(pivot);
    this.ramps.push(pivot);
  }

  /* -------------------------------------------------------
     6) BACKGROUND
     ------------------------------------------------------- */
  buildBackground(loop) {
    /* Digital grid floor */
    const grid = new THREE.GridHelper(1400, 140, 0x0a6a9a, 0x0a2a44);
    grid.position.y = -0.05;
    this.group.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({
        color: 0x02050b,
        roughness: 1,
        metalness: 0
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.group.add(floor);

    /* Low-poly prism skyline, kept off the road */
    const windowMap = this.makeWindowTexture();
    const tints = [0x00eaff, 0xff2bd6, 0xffb347];
    const mats = tints.map(
      tint =>
        new THREE.MeshStandardMaterial({
          color: 0x070c18,
          roughness: 0.7,
          metalness: 0.3,
          emissive: tint,
          emissiveMap: windowMap || null,
          emissiveIntensity: windowMap ? 1.2 : 0.15
        })
    );

    const clearance = this.laneHalfWidth + 30;
    const clearanceSq = clearance * clearance;
    const minR = this.radiusMax + 45;
    const maxR = this.radiusMax + 260;

    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 70; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = minR + Math.random() * (maxR - minR);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      let tooClose = false;
      for (let k = 0; k < loop.length; k++) {
        const dx = loop[k].x - x;
        const dz = loop[k].z - z;
        if (dx * dx + dz * dz < clearanceSq) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const width = 10 + Math.random() * 18;
      const depth = 10 + Math.random() * 18;
      const height = 18 + Math.random() * 70;

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        mats[placed % mats.length]
      );
      building.position.set(x, height / 2, z);
      building.rotation.y = Math.random() * Math.PI;
      building.castShadow = true;
      this.group.add(building);
      placed++;
    }
  }

  makeWindowTexture() {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 8) {
      for (let x = 4; x < 60; x += 8) {
        if (Math.random() < 0.45) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y, 4, 5);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}

/* Expose for classic <script> loading (main.js uses the bare name). */
if (typeof window !== "undefined") {
  window.TrackGenerator = TrackGenerator;
}
