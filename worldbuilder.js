/* =========================================================
   CODEQUESTER WORLD 2.0 — WORLD BUILDER
   Three.js r156 | Plain script | No ES modules

   Adds a separate road/access layer to a supplied world group.
   It deliberately does NOT edit cityvisuals.js, billboards,
   photos, artwork, radio, traffic NPCs, or energy vampires.

   API:
     const world = CQWorldBuilder.build(scene, options);
     world.dispose();

   Pass options.parentGroup to attach this layer to an existing
   track group. Do not call build twice on the same scene unless
   you dispose the previous result first.
   ========================================================= */
(function (global) {
  "use strict";

  const CONFIG = () => global.CQWorldConfig;

  function makeMaterial(color, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color,
      roughness: 0.92,
      metalness: 0.02
    }, extra || {}));
  }

  function addBox(group, name, x, y, z, width, height, depth, material) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    return mesh;
  }

  function addRoadSegment(group, name, a, b, width, materials, options) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return null;

    const angle = Math.atan2(-dx, -dz);
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    const y = options.y;

    // Road surface
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, length),
      materials.road
    );
    road.name = name;
    road.position.set(midX, y, midZ);
    road.rotation.y = angle;
    road.receiveShadow = true;
    group.add(road);

    // Thin shoulder strips keep the road readable without adding
    // tall curbs that could catch the car.
    [-1, 1].forEach((side) => {
      const shoulder = new THREE.Mesh(
        new THREE.BoxGeometry(options.shoulderWidth, 0.025, length),
        materials.shoulder
      );
      shoulder.name = name + "_shoulder_" + side;
      shoulder.position.set(midX + Math.cos(angle) * side * (width / 2 + options.shoulderWidth / 2), y + 0.035, midZ + Math.sin(angle) * side * (width / 2 + options.shoulderWidth / 2));
      shoulder.rotation.y = angle;
      group.add(shoulder);
    });

    // Center marking is intentionally broken into short dashes.
    const dashLength = 4;
    const dashGap = 5;
    const count = Math.floor(length / (dashLength + dashGap));
    for (let i = 0; i < count; i++) {
      const along = -length / 2 + 3 + i * (dashLength + dashGap);
      const px = midX + Math.sin(angle) * along;
      const pz = midZ + Math.cos(angle) * along;
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.025, dashLength),
        materials.centerLine
      );
      dash.name = name + "_center_dash_" + i;
      dash.position.set(px, y + 0.055, pz);
      dash.rotation.y = angle;
      group.add(dash);
    }

    return road;
  }

  function pointOnEllipse(center, rx, rz, angle) {
    return {
      x: center.x + Math.cos(angle) * rx,
      z: center.z + Math.sin(angle) * rz
    };
  }

  function buildBoundary(group, config, materials) {
    const b = config.bounds;
    const inset = b.wallInset;
    const y = 0.1;
    const thickness = b.wallThickness;
    const height = b.wallHeight;
    const rails = [];

    if (!config.boundaries.createVisualRails) return rails;

    rails.push(addBox(group, "CQ_WorldBoundary_North", 0, y + height / 2, b.minZ + inset, (b.maxX - b.minX) - inset * 2, height, thickness, materials.boundary));
    rails.push(addBox(group, "CQ_WorldBoundary_South", 0, y + height / 2, b.maxZ - inset, (b.maxX - b.minX) - inset * 2, height, thickness, materials.boundary));
    rails.push(addBox(group, "CQ_WorldBoundary_West", b.minX + inset, y + height / 2, 0, thickness, height, (b.maxZ - b.minZ) - inset * 2, materials.boundary));
    rails.push(addBox(group, "CQ_WorldBoundary_East", b.maxX - inset, y + height / 2, 0, thickness, height, (b.maxZ - b.minZ) - inset * 2, materials.boundary));
    return rails;
  }

  function build(scene, options) {
    if (!global.THREE) throw new Error("CQWorldBuilder requires Three.js to load first.");
    const config = CONFIG();
    if (!config) throw new Error("Load worldconfig.js before worldbuilder.js.");

    options = options || {};
    const root = new THREE.Group();
    root.name = "CQ_WorldBuilder_Layer";
    (options.parentGroup || scene).add(root);

    const roadMat = makeMaterial(config.roads.color);
    const shoulderMat = makeMaterial(config.roads.shoulderColor);
    const centerMat = makeMaterial(config.roads.centerLineColor, { roughness: 1 });
    const boundaryMat = makeMaterial(config.boundaries.color);
    const materials = {
      road: roadMat,
      shoulder: shoulderMat,
      centerLine: centerMat,
      boundary: boundaryMat
    };

    const roadOptions = {
      y: config.roads.y,
      shoulderWidth: config.roads.shoulderWidth
    };
    const roads = [];

    // Primary access corridor: city edge toward the race-track zone.
    // This is a roadway layer only; it does not replace track geometry.
    if (config.roads.createConnectorToTrack) {
      const cityHalf = config.anchors.citySize / 2;
      const track = config.anchors.raceTrackCenter;
      const a = { x: cityHalf + 8, z: 0 };
      const b = { x: track.x - config.anchors.raceTrackRadiusMax - 12, z: 0 };
      roads.push(addRoadSegment(root, "CQ_AccessRoad_CityToTrack", a, b, config.roads.connectorWidth, materials, roadOptions));
    }

    // Optional outer access loop; disabled by default so the initial
    // pass doesn't add roads through unknown locations or reserved lots.
    if (config.roads.createBoundaryRoad) {
      const b = config.bounds;
      const pad = 70;
      const corners = [
        { x: b.minX + pad, z: b.minZ + pad },
        { x: b.maxX - pad, z: b.minZ + pad },
        { x: b.maxX - pad, z: b.maxZ - pad },
        { x: b.minX + pad, z: b.maxZ - pad }
      ];
      corners.forEach((p, i) => {
        roads.push(addRoadSegment(root, "CQ_BoundaryRoad_" + i, p, corners[(i + 1) % corners.length], config.roads.mainWidth, materials, roadOptions));
      });
    }

    const boundaryMeshes = buildBoundary(root, config, materials);

    // Expose world bounds for a future, small main.js movement check.
    // No existing collision code is overwritten here.
    const api = {
      group: root,
      bounds: Object.assign({}, config.bounds),
      roads,
      boundaryMeshes,
      reservedAreas: config.reservedAreas,
      isInsideBounds: function (x, z, margin) {
        margin = Number.isFinite(margin) ? margin : 0;
        const b = config.bounds;
        return x >= b.minX + margin && x <= b.maxX - margin &&
               z >= b.minZ + margin && z <= b.maxZ - margin;
      },
      dispose: function () {
        if (root.parent) root.parent.remove(root);
        root.traverse(function (obj) {
          if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(function (mat) { if (mat && mat.dispose) mat.dispose(); });
          }
        });
      }
    };

    root.userData.CQWorldBuilder = api;
    return api;
  }

  global.CQWorldBuilder = { build };
})(window);
