/* =========================================================
   CODEQUESTER — CITY VISUALS (post-pass)
   Three.js r156, plain script (no ES modules).
   Exposes: window.CQCityVisuals

   HOW IT WORKS
   Runs ONCE after track.generate(). It does not change the
   generator, the car, the camera or the physics. It:
     - swaps ~250 per-building materials for a small shared set
     - assigns zones: downtown / entertainment / general
     - adds a skybox (with fallback) and a distant skyline
     - dresses the record store landmark
     - turns one entertainment building into a MOVIE THEATRE
       (TheStatic.gif plays on its screen)
     - adds storefronts, digital billboards, murals

   PERFORMANCE
   - Shared materials and textures, built once.
   - Static overlays have matrixAutoUpdate off.
   - No new lights. No post-processing.
   - Per frame: skybox follow, 1-3 vinyl spins, a billboard slide
     swap every 4 s, and the GIF redraw (only when the car is
     near the theatre, ~10 fps).
   ========================================================= */
(() => {
  "use strict";

  const IMAGES = "assets/images/";

  const ASSET = {
    cq1: PHOTOS + "cq1.jpg",
    cq2: PHOTOS + "cq2.jpg",
    theStaticGif: PHOTOS + "TheStatic.gif",
    theStaticPng: PHOTOS + "thestatic.PNG",
    /* optional: drop an equirectangular image here to replace
       the generated night-sky gradient */
    skybox: "assets/city/skybox.jpg"
  };

  const TILE_METERS = 16;
  const MAX_BILLBOARDS = 14;
  const MAX_MURALS = 12;
  const SKY_RADIUS = 700;
  const GIF_ACTIVE_DISTANCE = 150;

  const TYPE_COLORS = {
    auto_shop: 0x26384a,
    record_store: 0x33253c,
    restaurant: 0x473326,
    clothing_store: 0x263c3c,
    radio_station: 0x222c45,
    warehouse: 0x30353b,
    office: 0x242b38,
    apartment: 0x35343d,
    bank: 0x394036,
    business: 0x252a34
  };

  const ZONE_STYLE = {
    general: {
      lit: 0.42,
      glow: 0.8,
      palette: ["#ffe9a8", "#fff4cc", "#cfe8ff"]
    },
    downtown: {
      lit: 0.7,
      glow: 1.0,
      palette: ["#bfe4ff", "#e6f6ff", "#8fd0ff"]
    },
    entertainment: {
      lit: 0.82,
      glow: 1.2,
      palette: ["#ff2bd6", "#00eaff", "#ffe14a", "#ffffff"]
    }
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const S = {
    track: null,
    root: null,
    sky: null,
    textures: new Map(),
    materials: new Map(),
    zoneTiles: {},
    vinyls: [],
    digiMats: [],
    digiSlides: [],
    digiTimer: 0,
    digiIndex: 0,
    digiNext: 0,
    muralMats: [],
    storefrontMats: [],
    gif: null,
    billboards: 0,
    murals: 0,
    unitPlane: null,
    unitBox: null,
    frameMat: null,
    center: { x: 156, z: -156 }
  };

  /* =======================================================
     CANVAS TEXTURE HELPERS
     ======================================================= */
  function canvasTexture(w, h, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      draw(ctx, w, h);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  function makePlaceholderCanvas(label) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    if (g) {
      g.fillStyle = "#101626";
      g.fillRect(0, 0, 256, 128);
      g.strokeStyle = "#00eaff";
      g.lineWidth = 4;
      g.strokeRect(6, 6, 244, 116);
      g.fillStyle = "#00eaff";
      g.font = "bold 20px Arial, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label || "", 128, 64);
    }
    return canvas;
  }

  /* ---------------------------------------------------------
     loadOptionalTexture(path, options)
     Returns a texture IMMEDIATELY (a placeholder), then swaps in
     the real image when it loads. If the file is missing the
     placeholder simply stays — the game never breaks.
     options.aspect  crop-to-fill for a plane of that width/height
     options.placeholder  a canvas to show until/unless it loads
     --------------------------------------------------------- */
  function loadOptionalTexture(path, options) {
    const opts = options || {};
    const key = path + "|" + (opts.aspect || 0);

    if (S.textures.has(key)) {
      return S.textures.get(key);
    }

    const placeholder =
      opts.placeholder ||
      makePlaceholderCanvas(opts.label || path.split("/").pop());

    const tex = new THREE.CanvasTexture(placeholder);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    S.textures.set(key, tex);

    try {
      new THREE.TextureLoader().load(
        path,
        loaded => {
          const img = loaded.image;
          if (!img) {
            return;
          }

          /*
            The placeholder may already be on the GPU at a
            different size, so release it before swapping.
          */
          tex.dispose();
          tex.image = img;

          if (opts.aspect && img.width && img.height) {
            const imageAspect = img.width / img.height;
            tex.repeat.set(1, 1);
            tex.offset.set(0, 0);

            if (imageAspect > opts.aspect) {
              tex.repeat.x = opts.aspect / imageAspect;
              tex.offset.x = (1 - tex.repeat.x) / 2;
            } else {
              tex.repeat.y = imageAspect / opts.aspect;
              tex.offset.y = (1 - tex.repeat.y) / 2;
            }
          }

          tex.needsUpdate = true;
        },
        undefined,
        () => {
          console.warn("CodeQuestER: optional image not found: " + path);
        }
      );
    } catch (error) {
      /* keep placeholder */
    }

    return tex;
  }

  /* =======================================================
     SHARED MATERIAL LIBRARY
     ======================================================= */
  function signMat(tex) {
    const key = "sign|" + tex.uuid;
    let mat = S.materials.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
      S.materials.set(key, mat);
    }
    return mat;
  }

  function windowTile(palette, litChance, cols, rows, background) {
    const tex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = background || "#000000";
      g.fillRect(0, 0, w, h);

      const cw = w / cols;
      const ch = h / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < litChance) {
            g.fillStyle = pick(palette);
            g.fillRect(
              c * cw + cw * 0.2,
              r * ch + ch * 0.22,
              cw * 0.6,
              ch * 0.5
            );
          }
        }
      }
    });

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function getZoneTile(zone) {
    if (!S.zoneTiles[zone]) {
      const style = ZONE_STYLE[zone];
      S.zoneTiles[zone] = windowTile(style.palette, style.lit, 4, 4);
    }
    return S.zoneTiles[zone];
  }

  function buildingMat(zone, type) {
    const key = "bld|" + zone + "|" + type;
    let mat = S.materials.get(key);

    if (!mat) {
      const style = ZONE_STYLE[zone];
      const color = new THREE.Color(TYPE_COLORS[type] || TYPE_COLORS.business);

      if (zone === "entertainment") {
        color.offsetHSL(0, 0.12, 0.05);
      } else if (zone === "downtown") {
        color.offsetHSL(0, -0.05, 0.03);
      }

      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.75,
        metalness: 0.15,
        emissive: 0xffffff,
        emissiveMap: getZoneTile(zone),
        emissiveIntensity: style.glow
      });

      S.materials.set(key, mat);
    }

    return mat;
  }

  /*
    Box UVs run 0..1 per face. Scale them so a window cell is
    TILE_METERS wide on every wall regardless of building size,
    which lets all buildings of a zone share ONE material.
    Roofs sample the tile's black corner (no windows).
  */
  function tileBoxUVs(geometry, height) {
    const p = geometry.parameters;
    const uv = geometry.attributes && geometry.attributes.uv;
    if (!p || !uv) {
      return;
    }

    const faces = [
      [p.depth, height],
      [p.depth, height],
      null,
      null,
      [p.width, height],
      [p.width, height]
    ];

    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        if (!faces[f]) {
          uv.setXY(i, 0.01, 0.01);
        } else {
          uv.setXY(
            i,
            (uv.getX(i) * faces[f][0]) / TILE_METERS,
            (uv.getY(i) * faces[f][1]) / TILE_METERS
          );
        }
      }
    }

    uv.needsUpdate = true;
  }

  /* =======================================================
     GENERATED ARTWORK TEXTURES
     ======================================================= */
  function fitFont(g, text, maxWidth, size) {
    let s = size;
    g.font = "bold " + s + "px Arial, sans-serif";
    while (g.measureText(text).width > maxWidth && s > 10) {
      s -= 4;
      g.font = "bold " + s + "px Arial, sans-serif";
    }
  }

  function neonTexture(lines, color, w, h, background) {
    return canvasTexture(w, h, g => {
      g.fillStyle = background || "#07040f";
      g.fillRect(0, 0, w, h);

      g.shadowColor = color;
      g.shadowBlur = 18;
      g.strokeStyle = color;
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);

      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";

      const lineHeight = (h - 40) / lines.length;

      lines.forEach((text, i) => {
        fitFont(g, text, w * 0.88, Math.floor(lineHeight * 0.78));
        g.fillText(text, w / 2, 20 + lineHeight * (i + 0.5));
      });
    });
  }

  function adSlide(title, sub, c1, c2) {
    return canvasTexture(512, 256, (g, w, h) => {
      const gradient = g.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, c1);
      gradient.addColorStop(1, c2);
      g.fillStyle = gradient;
      g.fillRect(0, 0, w, h);

      g.fillStyle = "rgba(255,255,255,0.10)";
      for (let x = -h; x < w; x += 40) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 20, h);
        g.lineTo(x + 20 + h, 0);
        g.lineTo(x + h, 0);
        g.closePath();
        g.fill();
      }

      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.shadowColor = "rgba(0,0,0,0.6)";
      g.shadowBlur = 10;
      fitFont(g, title, w * 0.86, 92);
      g.fillText(title, w / 2, h * 0.42);
      fitFont(g, sub, w * 0.8, 36);
      g.fillText(sub, w / 2, h * 0.76);
    });
  }

  function graffitiTexture(tagText) {
    return canvasTexture(256, 160, (g, w, h) => {
      g.fillStyle = "#17121f";
      g.fillRect(0, 0, w, h);

      const colors = ["#ff2bd6", "#00eaff", "#ffe14a", "#22ff66", "#ff5a2a"];

      g.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        g.strokeStyle = pick(colors);
        g.lineWidth = rand(6, 16);
        g.beginPath();
        g.moveTo(rand(0, w), rand(0, h));
        g.bezierCurveTo(
          rand(0, w), rand(0, h),
          rand(0, w), rand(0, h),
          rand(0, w), rand(0, h)
        );
        g.stroke();
      }

      g.textAlign = "center";
      g.textBaseline = "middle";
      fitFont(g, tagText, w * 0.7, 84);
      g.lineWidth = 8;
      g.strokeStyle = "#000000";
      g.strokeText(tagText, w / 2, h / 2);
      g.fillStyle = pick(colors);
      g.fillText(tagText, w / 2, h / 2);
    });
  }

  function storefrontTexture(c1, c2, glow) {
    return canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = "#090d18";
      g.fillRect(0, 0, w, h);

      for (let x = 0; x < w; x += 32) {
        g.fillStyle = (x / 32) % 2 ? c1 : c2;
        g.fillRect(x, 0, 32, 30);
      }

      const panes = 4;
      const pw = w / panes;

      for (let i = 0; i < panes; i++) {
        const gradient = g.createLinearGradient(0, 36, 0, h);
        gradient.addColorStop(0, glow);
        gradient.addColorStop(1, "#0a0f1c");
        g.fillStyle = gradient;
        g.fillRect(i * pw + 8, 38, pw - 16, h - 46);
      }
    });
  }

  function recordDisplayTexture() {
    return canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#0b0714";
      g.fillRect(0, 0, w, h);

      const cols = 6;
      const rows = 3;
      const cw = w / cols;
      const ch = h / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          g.fillStyle =
            "hsl(" + Math.floor(rand(0, 360)) + ",80%," +
            Math.floor(rand(40, 60)) + "%)";
          g.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 8);
          g.fillStyle = "rgba(0,0,0,0.35)";
          g.beginPath();
          g.arc(c * cw + cw / 2, r * ch + ch / 2, cw * 0.28, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  }

  function doorTexture() {
    return canvasTexture(128, 192, (g, w, h) => {
      g.fillStyle = "#06101c";
      g.fillRect(0, 0, w, h);
      g.shadowColor = "#00eaff";
      g.shadowBlur = 14;
      g.strokeStyle = "#00eaff";
      g.lineWidth = 6;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.beginPath();
      g.moveTo(w / 2, 8);
      g.lineTo(w / 2, h - 8);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = "#ffffff";
      g.font = "bold 20px Arial, sans-serif";
      g.textAlign = "center";
      g.fillText("OPEN", w / 2, h * 0.3);
    });
  }

  function vinylTexture() {
    return canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = "#050505";
      g.fillRect(0, 0, w, h);

      g.strokeStyle = "rgba(255,255,255,0.10)";
      g.lineWidth = 1;
      for (let r = 40; r < 124; r += 5) {
        g.beginPath();
        g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        g.stroke();
      }

      g.fillStyle = "#ff2bd6";
      g.beginPath();
      g.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = "#050505";
      g.beginPath();
      g.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.moveTo(w / 2, h / 2);
      g.arc(w / 2, h / 2, 120, -0.5, 0.1);
      g.closePath();
      g.fill();
    });
  }

  function skyGradientCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 512;
    const g = canvas.getContext("2d");

    if (g) {
      const gradient = g.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0.0, "#01030a");
      gradient.addColorStop(0.3, "#050b24");
      gradient.addColorStop(0.44, "#1b0f3d");
      gradient.addColorStop(0.5, "#35154f");
      gradient.addColorStop(0.505, "#02050b");
      gradient.addColorStop(1.0, "#02050b");
      g.fillStyle = gradient;
      g.fillRect(0, 0, 8, 512);
    }

    return canvas;
  }

  /* =======================================================
     PLACEMENT HELPERS
     Overlays are flat planes / boxes added to ONE group.
     face is "+z" | "-z" | "+x" | "-x"; `out` is metres away
     from the wall (negative = inside the building).
     ======================================================= */
  function place(mesh) {
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    S.root.add(mesh);
    return mesh;
  }

  function facePoint(b, face, out) {
    const gp = b.geometry.parameters;
    const hw = gp.width / 2;
    const hd = gp.depth / 2;

    switch (face) {
      case "+z":
        return { x: b.position.x, z: b.position.z + hd + out, rotY: 0, w: gp.width };
      case "-z":
        return { x: b.position.x, z: b.position.z - hd - out, rotY: Math.PI, w: gp.width };
      case "+x":
        return { x: b.position.x + hw + out, z: b.position.z, rotY: Math.PI / 2, w: gp.depth };
      default:
        return { x: b.position.x - hw - out, z: b.position.z, rotY: -Math.PI / 2, w: gp.depth };
    }
  }

  function onFace(b, face, mat, w, h, xOff, y, out) {
    const p = facePoint(b, face, out);
    const lx = Math.cos(p.rotY);
    const lz = -Math.sin(p.rotY);

    const mesh = new THREE.Mesh(S.unitPlane, mat);
    mesh.scale.set(w, h, 1);
    mesh.position.set(p.x + lx * xOff, y, p.z + lz * xOff);
    mesh.rotation.y = p.rotY;
    return place(mesh);
  }

  function boxOnFace(b, face, mat, w, h, d, xOff, y, out) {
    const p = facePoint(b, face, out);
    const lx = Math.cos(p.rotY);
    const lz = -Math.sin(p.rotY);

    const mesh = new THREE.Mesh(S.unitBox, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(p.x + lx * xOff, y, p.z + lz * xOff);
    mesh.rotation.y = p.rotY;
    return place(mesh);
  }

  /* a framed board standing on the roof */
  function roofBoard(b, face, mat, w, h, yCenter, out) {
    boxOnFace(b, face, S.frameMat, w + 0.5, h + 0.4, 0.5, 0, yCenter, out - 0.27);
    return onFace(b, face, mat, w, h, 0, yCenter, out);
  }

  /* generic helper: put artwork (texture or image path) on a wall */
  function addBuildingArtwork(b, face, source, o) {
    const opts = o || {};
    const w = opts.w || 8;
    const h = opts.h || 5;

    const tex =
      typeof source === "string"
        ? loadOptionalTexture(source, { aspect: w / h })
        : source;

    return onFace(
      b,
      face,
      signMat(tex),
      w,
      h,
      opts.x || 0,
      opts.y || 4,
      opts.out || 0.12
    );
  }

  function outwardFaces(b) {
    const T = S.track;
    const half = T.citySize / 2;
    const spacing = T.cityBlockSize + T.streetWidth;
    const first = -half + spacing / 2;

    const centerOf = v => first + Math.round((v - first) / spacing) * spacing;

    return {
      x: b.position.x >= centerOf(b.position.x) ? "+x" : "-x",
      z: b.position.z >= centerOf(b.position.z) ? "+z" : "-z"
    };
  }

  /* =======================================================
     ZONES
     ======================================================= */
  function zoneAt(x, z) {
    if (
      Math.abs(x - S.center.x) <= 100 &&
      Math.abs(z - S.center.z) <= 100
    ) {
      return "entertainment";
    }
    if (Math.abs(x) <= 90 && Math.abs(z) <= 90) {
      return "downtown";
    }
    return "general";
  }

  /* =======================================================
     SKY + SKYLINE
     ======================================================= */
  function buildSky() {
    const tex = loadOptionalTexture(ASSET.skybox, {
      placeholder: skyGradientCanvas()
    });

    const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    geometry.scale(-1, 1, 1);

    const sky = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false })
    );

    sky.name = "CQ_Sky";
    sky.renderOrder = -1000;
    sky.frustumCulled = false;

    S.sky = sky;
    S.root.add(sky);
  }

  function buildSkyline() {
    const count = 110;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

    const tex = windowTile(
      ["#9fd8ff", "#ffe9a8", "#ff7ae6"],
      0.28,
      4,
      8,
      "#070b18"
    );
    tex.repeat.set(2, 4);

    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, fog: false }),
      count
    );

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.03, 0.03);
      const radius = rand(560, 700);
      const height = 50 + Math.pow(Math.random(), 2) * 210;

      dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(rand(16, 46), height, rand(16, 46));
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHSL(0.62, 0.3, rand(0.45, 0.9)));
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    mesh.name = "CQ_Skyline";
    mesh.frustumCulled = false;
    S.root.add(mesh);
  }

  /* =======================================================
     SHARED ARTWORK SETS
     ======================================================= */
  function buildArtworkSets() {
    S.unitPlane = new THREE.PlaneGeometry(1, 1);
    S.unitBox = new THREE.BoxGeometry(1, 1, 1);
    S.frameMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e18,
      roughness: 0.6,
      metalness: 0.5
    });

    /* digital billboards: 3 shared materials cycling the same slides */
    S.digiSlides = [
      adSlide("NOW PLAYING", "THE STATIC", "#ff2bd6", "#3a0b66"),
      adSlide("RECORD STORE", "NEW DROPS", "#00eaff", "#08265c"),
      adSlide("LIVE TONIGHT", "ENTERTAINMENT DISTRICT", "#ffb000", "#7a1500"),
      adSlide("CODEQUESTER", "DRIVE THE CITY", "#22ff66", "#063a2a"),
      loadOptionalTexture(ASSET.cq1, { aspect: 2 }),
      loadOptionalTexture(ASSET.cq2, { aspect: 2 })
    ];

    for (let i = 0; i < 3; i++) {
      S.digiMats.push(
        new THREE.MeshBasicMaterial({
          map: S.digiSlides[i * 2],
          fog: false
        })
      );
    }

    S.muralMats = [
      signMat(graffitiTexture("CQ")),
      signMat(graffitiTexture("NEON")),
      signMat(graffitiTexture("ER")),
      signMat(loadOptionalTexture(ASSET.cq1, { aspect: 1.6 })),
      signMat(loadOptionalTexture(ASSET.cq2, { aspect: 1.6 }))
    ];

    S.storefrontMats = [
      signMat(storefrontTexture("#ff2bd6", "#6a0f5a", "#8a1f8a")),
      signMat(storefrontTexture("#ffb000", "#8a2a00", "#a8641a")),
      signMat(storefrontTexture("#00eaff", "#08467a", "#1a7a9a"))
    ];
  }

  function nextDigiMat() {
    const mat = S.digiMats[S.digiNext % S.digiMats.length];
    S.digiNext++;
    return mat;
  }

  /* =======================================================
     RESTYLE EVERY BUILDING (materials + zone heights)
     ======================================================= */
  function restyleBuildings(hq, theatre) {
    const old = new Set();

    S.track.buildings.forEach(b => {
      const gp = b.geometry && b.geometry.parameters;
      if (!gp) {
        return;
      }

      const destination = !!(b.userData && b.userData.destination);
      const zone = zoneAt(b.position.x, b.position.z);
      let type = (b.userData && b.userData.buildingType) || "business";

      /* only the real destination is the record store landmark */
      if (!destination && type === "record_store") {
        type = "business";
      }

      old.add(b.material);
      b.material = buildingMat(zone, type);

      if (!destination) {
        let scale = 1;
        if (zone === "entertainment") {
          scale = rand(0.9, 1.7);
        } else if (zone === "downtown") {
          scale = rand(1.2, 2.0);
        }

        const minHeight = b === hq ? 40 : b === theatre ? 22 : 0;
        if (minHeight && gp.height * scale < minHeight) {
          scale = minHeight / gp.height;
        }

        if (scale !== 1) {
          b.scale.y = scale;
          b.position.y = (gp.height * scale) / 2;
        }
      }

      const height = gp.height * b.scale.y;
      b.userData.cqZone = zone;
      b.userData.cqHeight = height;
      tileBoxUVs(b.geometry, height);
    });

    old.forEach(material => {
      if (material && material.dispose) {
        material.dispose();
      }
    });
  }

  /* =======================================================
     ZONE DRESSING
     ======================================================= */
  function placeStorefront(b, face) {
    const p = facePoint(b, face, 0);
    onFace(b, face, pick(S.storefrontMats), p.w * 0.92, 3.4, 0, 2.0, 0.1);
  }

  function roofBillboard(b, face) {
    const p = facePoint(b, face, 0);
    const w = Math.min(p.w * 0.9, 14);
    const h = w / 2;
    const y = b.userData.cqHeight + h / 2 + 0.2;

    roofBoard(b, face, nextDigiMat(), w, h, y, -0.9);
    S.billboards++;
  }

  function placeMural(b, face) {
    const h = Math.min(5, b.userData.cqHeight - 1);
    if (h < 3) {
      return;
    }

    addBuildingArtwork(b, face, pick(S.muralMats).map, {
      w: 8,
      h,
      y: h / 2 + 0.6,
      out: 0.12
    });
    S.murals++;
  }

  function dressZones(skip) {
    S.track.buildings.forEach(b => {
      if (skip.has(b) || (b.userData && b.userData.destination)) {
        return;
      }

      const zone = b.userData.cqZone;
      const out = outwardFaces(b);

      if (zone === "entertainment") {
        placeStorefront(b, out.z);

        if (Math.random() < 0.5) {
          placeStorefront(b, out.x);
        }

        if (S.billboards < MAX_BILLBOARDS && Math.random() < 0.45) {
          roofBillboard(b, out.z);
        } else if (S.murals < MAX_MURALS && Math.random() < 0.3) {
          placeMural(b, out.x);
        }
      } else if (S.murals < MAX_MURALS && Math.random() < 0.06) {
        placeMural(b, out.x);
      }
    });
  }

  /* =======================================================
     RECORD STORE LANDMARK
     Dresses the existing destination building on its -Z face.
     ======================================================= */
  function dressRecordStore(landmark) {
    const b = landmark.building;
    if (!b) {
      return;
    }

    const face = "-z";
    const gp = b.geometry.parameters;
    const W = gp.width;
    const H = gp.height;

    /* the generic cyan destination sign is replaced by the neon one */
    const oldSign = S.track.group.getObjectByName(
      "DestinationSign_RECORD STORE"
    );
    if (oldSign) {
      oldSign.visible = false;
    }

    /* display windows either side of the door */
    const displayMat = signMat(recordDisplayTexture());
    onFace(b, face, displayMat, 6.5, 3.2, -5.8, 2.0, 0.12);
    onFace(b, face, displayMat, 6.5, 3.2, 5.8, 2.0, 0.12);

    /* recognizable entrance */
    onFace(b, face, signMat(doorTexture()), 2.8, 3.4, 0, 1.75, 0.13);

    /* canopy over the entrance with a lit strip */
    boxOnFace(b, face, S.frameMat, W * 0.95, 0.5, 2.4, 0, 4.1, 1.2);
    onFace(
      b,
      face,
      signMat(
        neonTexture(["RECORDS  VINYL  TAPES  LIVE"], "#00eaff", 1024, 96, "#06101c")
      ),
      W * 0.9,
      0.42,
      0,
      4.1,
      2.42
    );

    /* big neon roof sign */
    roofBoard(
      b,
      face,
      signMat(neonTexture(["RECORD STORE"], "#ff2bd6", 1024, 256)),
      12,
      3,
      H + 2.0,
      -0.6
    );

    /* tall digital billboard behind it */
    roofBoard(b, face, nextDigiMat(), 12, 6, H + 7.2, -3.0);

    /* two spinning vinyl records on the roofline */
    const discGeometry = new THREE.CylinderGeometry(2.2, 2.2, 0.3, 40);
    const cap = new THREE.MeshBasicMaterial({ map: vinylTexture(), fog: false });
    const edge = new THREE.MeshBasicMaterial({ color: 0x050505, fog: false });
    const p = facePoint(b, face, -0.6);

    [-1, 1].forEach(side => {
      const disc = new THREE.Mesh(discGeometry, [edge, cap, cap]);
      disc.rotation.set(-Math.PI / 2, 0, 0);
      disc.position.set(p.x + side * (W / 2 - 1.4), H + 2.6, p.z);
      S.root.add(disc);
      S.vinyls.push(disc);
    });
  }

  /* =======================================================
     MOVIE THEATRE  (TheStatic.gif on the big screen)
     ======================================================= */
  function makeGifScreen(aspect) {
    const W = 384;
    const H = Math.round(W / aspect);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "#05070d";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#00eaff";
      ctx.font = "bold 36px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("THE STATIC", W / 2, H / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    /*
      WebGL cannot play a GIF directly. The GIF lives in a tiny
      hidden <img> (the browser animates it) and the current frame
      is copied to this canvas a few times a second while the car
      is near. If the browser only exposes the first frame, the
      screen shows a still image — nothing breaks.
    */
    const img = new Image();
    img.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;" +
      "pointer-events:none;z-index:-1;";

    const screen = {
      img,
      canvas,
      ctx,
      tex,
      W,
      H,
      ready: false,
      timer: 0,
      x: 0,
      z: 0
    };

    img.onload = () => {
      screen.ready = true;
      paintGif(screen);
    };
    img.onerror = () => {
      console.warn("CodeQuestER: optional image not found: " + ASSET.theStaticGif);
    };

    document.body.appendChild(img);
    img.src = ASSET.theStaticGif;

    return screen;
  }

  function paintGif(screen) {
    const iw = screen.img.naturalWidth;
    const ih = screen.img.naturalHeight;
    if (!screen.ctx || !iw || !ih) {
      return;
    }

    const scale = Math.max(screen.W / iw, screen.H / ih);
    const dw = iw * scale;
    const dh = ih * scale;

    screen.ctx.drawImage(
      screen.img,
      (screen.W - dw) / 2,
      (screen.H - dh) / 2,
      dw,
      dh
    );
    screen.tex.needsUpdate = true;
  }

  function dressTheatre(b) {
    const face = outwardFaces(b).z;
    const p = facePoint(b, face, 0);
    const W = p.w;
    const H = b.userData.cqHeight;

    /* big screen */
    const sw = Math.min(W * 0.86, 13);
    const sh = (sw * 9) / 16;

    S.gif = makeGifScreen(16 / 9);
    S.gif.x = b.position.x;
    S.gif.z = b.position.z;

    boxOnFace(b, face, S.frameMat, sw + 0.8, sh + 0.8, 0.3, 0, 10.5, 0.1);
    onFace(
      b,
      face,
      new THREE.MeshBasicMaterial({ map: S.gif.tex, fog: false }),
      sw,
      sh,
      0,
      10.5,
      0.27
    );

    /* roof-level name sign */
    onFace(
      b,
      face,
      signMat(neonTexture(["THE STATIC", "MOVIE THEATRE"], "#ffb000", 1024, 256)),
      Math.min(W * 0.86, 12),
      3,
      0,
      H - 2.4,
      0.12
    );

    /* marquee over the entrance */
    boxOnFace(b, face, S.frameMat, W * 0.92, 0.6, 3.0, 0, 4.6, 1.5);
    onFace(
      b,
      face,
      signMat(
        neonTexture(["NOW SHOWING  •  THE STATIC"], "#ff2bd6", 1024, 96, "#12040f")
      ),
      W * 0.9,
      0.5,
      0,
      4.6,
      3.02
    );

    /* posters either side of the doors */
    const posterX = Math.max(W * 0.5 - 3, 4);
    addBuildingArtwork(b, face, ASSET.theStaticPng, {
      w: 2.7,
      h: 4,
      x: -posterX,
      y: 2.3,
      out: 0.12
    });
    addBuildingArtwork(b, face, ASSET.theStaticPng, {
      w: 2.7,
      h: 4,
      x: posterX,
      y: 2.3,
      out: 0.12
    });

    /* doors */
    onFace(b, face, signMat(doorTexture()), 3, 3.2, 0, 1.7, 0.13);

    /* register as a landmark (no interaction yet) */
    if (window.CQLocations) {
      const gp = b.geometry.parameters;
      CQLocations.register({
        id: "movie_theatre",
        type: "movie_theatre",
        name: "MOVIE THEATRE",
        position: { x: b.position.x, y: 0, z: b.position.z },
        halfWidth: gp.width / 2,
        halfDepth: gp.depth / 2,
        interactRadius: 0,
        building: b
      });
    }
  }

  /* =======================================================
     HEADQUARTERS (downtown)
     ======================================================= */
  function dressHeadquarters(b) {
    const face = outwardFaces(b).z;
    const H = b.userData.cqHeight;

    const board = addBuildingArtwork(b, face, ASSET.cq2, {
      w: 14,
      h: 8,
      y: Math.min(14, H * 0.4),
      out: 0.2
    });
    boxOnFace(
      b,
      face,
      S.frameMat,
      14.8,
      8.8,
      0.3,
      0,
      board.position.y,
      0.1
    );

    roofBoard(
      b,
      face,
      signMat(neonTexture(["CODEQUESTER", "HEADQUARTERS"], "#00eaff", 1024, 256)),
      13,
      3.2,
      H + 1.9,
      -0.9
    );
  }

  /* =======================================================
     APPLY (called once after track.generate())
     ======================================================= */
  function apply(track) {
    S.track = track;

    S.root = new THREE.Group();
    S.root.name = "CQ_CityVisuals";
    track.group.add(S.root);

    const record = window.CQLocations
      ? CQLocations.get("record_store")
      : null;

    if (record) {
      S.center.x = record.position.x;
      S.center.z = record.position.z;
    }

    buildArtworkSets();
    buildSky();
    buildSkyline();

    const blocks = track.buildings.filter(
      b => !(b.userData && b.userData.destination) && b.geometry
    );

    /* HQ: the downtown building closest to the city center */
    let hq = null;
    let hqDistance = Infinity;
    blocks.forEach(b => {
      if (zoneAt(b.position.x, b.position.z) !== "downtown") {
        return;
      }
      const d = Math.hypot(b.position.x, b.position.z);
      if (d < hqDistance) {
        hqDistance = d;
        hq = b;
      }
    });

    /* theatre: an entertainment building 45-95 m from the record store */
    let theatre = null;
    let theatreScore = Infinity;
    blocks.forEach(b => {
      if (zoneAt(b.position.x, b.position.z) !== "entertainment") {
        return;
      }
      const d = Math.hypot(b.position.x - S.center.x, b.position.z - S.center.z);
      const score = d >= 45 && d <= 95 ? Math.abs(d - 65) : 1000 + d;
      if (score < theatreScore) {
        theatreScore = score;
        theatre = b;
      }
    });

    restyleBuildings(hq, theatre);

    const special = new Set();
    if (hq) {
      special.add(hq);
    }
    if (theatre) {
      special.add(theatre);
    }

    dressZones(special);

    if (record) {
      dressRecordStore(record);
    }
    if (theatre) {
      dressTheatre(theatre);
    }
    if (hq) {
      dressHeadquarters(hq);
    }
  }

  /* =======================================================
     UPDATE (once per frame via CQHooks)
     ======================================================= */
  function update(delta, car) {
    if (!S.root) {
      return;
    }

    if (S.sky) {
      S.sky.position.set(car.x, 0, car.z);
    }

    for (let i = 0; i < S.vinyls.length; i++) {
      S.vinyls[i].rotation.y += delta * 1.4;
    }

    S.digiTimer += delta;
    if (S.digiTimer >= 4 && S.digiSlides.length) {
      S.digiTimer = 0;
      S.digiIndex++;
      for (let i = 0; i < S.digiMats.length; i++) {
        S.digiMats[i].map =
          S.digiSlides[(S.digiIndex + i * 2) % S.digiSlides.length];
      }
    }

    if (S.gif && S.gif.ready) {
      const dx = car.x - S.gif.x;
      const dz = car.z - S.gif.z;

      if (dx * dx + dz * dz < GIF_ACTIVE_DISTANCE * GIF_ACTIVE_DISTANCE) {
        S.gif.timer += delta;
        if (S.gif.timer >= 0.1) {
          S.gif.timer = 0;
          paintGif(S.gif);
        }
      }
    }
  }

  if (window.CQHooks) {
    window.CQHooks.register(update);
  }

  window.CQCityVisuals = {
    apply,
    update,
    zoneAt,
    loadOptionalTexture,
    addBuildingArtwork
  };
})();
