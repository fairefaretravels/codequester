/* =========================================================
   CODEQUESTER WORLD 2.0 — WORLD CONFIGURATION
   Three.js r156 | Plain script | No ES modules

   This file defines map layout only. It does not create
   geometry, load images, or change existing game systems.
   ========================================================= */
(function (global) {
  "use strict";

  const CQWorldConfig = {
    version: "2.0.0",

    // Main playable ground. Keep this aligned with the existing
    // black ground plane until the old generator is retired.
    bounds: {
      minX: -700,
      maxX: 700,
      minZ: -700,
      maxZ: 700,
      wallInset: 12,
      wallHeight: 3,
      wallThickness: 2
    },

    // Existing world landmarks retained as reference anchors.
    // These are not moved by this configuration.
    anchors: {
      cityCenter: { x: 0, z: 0 },
      citySize: 560,
      raceTrackCenter: { x: 440, z: 0 },
      raceTrackRadiusMin: 60,
      raceTrackRadiusMax: 90
    },

    roads: {
      mainWidth: 16,
      connectorWidth: 14,
      shoulderWidth: 2,
      y: 0.015,
      color: 0x777777,
      shoulderColor: 0x333943,
      centerLineColor: 0xd7d4bf,
      edgeLineColor: 0x8d9299,
      lineHeight: 0.035,
      createConnectorToTrack: true,
      createBoundaryRoad: false
    },

    ground: {
      y: -0.1,
      // Do not create another floor over the existing black ground.
      createGroundPlane: false
    },

    boundaries: {
      enabled: true,
      // Physical movement checks should use these bounds in main.js.
      // Visual rails are intentionally optional and off by default.
      createVisualRails: false,
      color: 0x27323d
    },

    // IMPORTANT: These are reservation slots, not venue placements.
    // Keep null until the actual black-ground concert/drive-in area
    // is confirmed from the current map. The builder will not put
    // buildings, roads, or decorations inside an unconfigured slot.
    reservedAreas: {
      concert: null,
      driveIn: null
    },

    // Reserved-area shape when coordinates are later confirmed:
    // { center: { x: number, z: number }, width: number, depth: number }
    districts: {
      downtown: { center: { x: 0, z: 0 }, width: 560, depth: 560 },
      raceTrack: { center: { x: 440, z: 0 }, width: 220, depth: 220 }
    }
  };

  global.CQWorldConfig = CQWorldConfig;
})(window);
