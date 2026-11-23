/* =========================================================
   CODEQUESTER — CITY PROMOS (add-on layer)
   Three.js r156, plain script (no ES modules).
   Exposes: window.CQPromos

   Load AFTER cityvisuals.js and BEFORE main.js:
     <script src="cityvisuals.js"></script>
     <script src="promos.js"></script>

   It wraps CQCityVisuals.apply() so it runs right after the city
   is dressed. It does not edit cityvisuals.js, the generator, the
   car, physics, traffic or the vampires. If any image is missing
   its sign simply stays hidden; the game never breaks.

   PUT THE IMAGES IN:  assets/promos/   (change DIR below to move)
   ========================================================= */
(() => {
  "use strict";

  const DIR = "assets/promos/";

  const P = {
    party:     DIR + "lqr.jpg",
    partySide: DIR + "Dflow1.jpg",
    arcade:    DIR + "mitd3d.jpg",
    bus:       DIR + "the-mixtape-ep.PNG",
    billboard: DIR + "bgstv.GIF",
    busStop:   DIR + "driveme.jpg",
    mall:      DIR + "bblogo.jpg",
    radio:     DIR + "christmas.gif"
  };

  const S = {
    track: null,
    root: null,
    plane: null,
    box: null,
    bulbGeo: null,
    frameMat: null,
    matA: null,
    matB: null,
    pulses: [],
    gifs: [],
    spots: [],
    t: 0,
    bulbTimer: 0,
    bulbFlip: false,
    busTimer: 0,
    busTries: 0,
    toast: null,
    toastTimer: 0,
    lastSpot: null
  };

  /* =======================================================
     LOADING
     ======================================================= */
  function lowerExt(p) {
    return p.replace(/\.[^./]+$/, m => m.toLowerCase());
  }

  function loadImage(path, onOk) {
    const loader = new THREE.TextureLoader();
    let retried = false;

    function go(p) {
      loader.load(
        p,
        tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          onOk(tex, tex.image);
        },
        undefined,
        () => {
          const alt = lowerExt(p);
          if (!retried && alt !== p) {
            retried = true;
            go(alt);
          } else {
            console.warn("CQ promos: image not found: " + path);
          }
        }
      );
    }
    go(path);
  }

  /* =======================================================
     PLACEMENT (same face convention as cityvisuals.js)
     ======================================================= */
  function facePoint(b, face, out) {
    const gp = b.geometry.parameters;
    const hw = gp.width / 2;
    const hd = gp.depth / 2;
    switch (face) {
      case "+z": return { x: b.position.x, z: b.position.z + hd + out, rotY: 0, w: gp.width };
      case "-z": return { x: b.position.x, z: b.position.z - hd - out, rotY: Math.PI, w: gp.width };
      case "+x": return { x: b.position.x + hw + out, z: b.position.z, rotY: Math.PI / 2, w: gp.depth };
      default:   return { x: b.position.x - hw - out, z: b.position.z, rotY: -Math.PI / 2, w: gp.depth };
    }
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

  function mount(group, b, face, xOff, y, out) {
    const p = facePoint(b, face, out);
    const lx = Math.cos(p.rotY);
    const lz = -Math.sin(p.rotY);
    group.position.set(p.x + lx * xOff, y, p.z + lz * xOff);
    group.rotation.y = p.rotY;
    S.root.add(group);
    return p;
  }

  const heightOf = b =>
    b.userData.cqHeight || b.geometry.parameters.height * b.scale.y;

  /* =======================================================
     CHASING BULBS (2 instanced meshes per sign, 2 shared
     materials toggled together = cheap)
     ======================================================= */
  function addBulbs(group, w, h, z) {
    const dummy = new THREE.Object3D();
    const aPos = [];
    const bPos = [];
    let n = 0;

    const nx = Math.max(2, Math.round(w / 1.3));
    const ny = Math.max(2, Math.round(h / 1.3));

    for (let i = 0; i <= nx; i++) {
      const x = -w / 2 + (i * w) / nx;
      (n % 2 ? bPos : aPos).push([x, h / 2, z]);
      n++;
      (n % 2 ? bPos : aPos).push([x, -h / 2, z]);
      n++;
    }
    for (let j = 1; j < ny; j++) {
      const y = -h / 2 + (j * h) / ny;
      (n % 2 ? bPos : aPos).push([-w / 2, y, z]);
      n++;
      (n % 2 ? bPos : aPos).push([w / 2, y, z]);
      n++;
    }

    [[aPos, S.matA], [bPos, S.matB]].forEach(pair => {
      const list = pair[0];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(S.bulbGeo, pair[1], list.length);
      list.forEach((p, i) => {
        dummy.position.set(p[0], p[1], p[2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
  }

  /* =======================================================
     SIGN BUILDERS
     ======================================================= */

  /* framed picture sign, hidden until the image loads, sized to
     the image's real proportions (never stretched or cropped) */
  function makeSign(path, maxW, maxH, flicker) {
    const g = new THREE.Group();
    g.visible = false;

    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const plane = new THREE.Mesh(S.plane, mat);
    const frame = new THREE.Mesh(S.box, S.frameMat);
    g.add(frame);
    g.add(plane);

    loadImage(path, (tex, img) => {
      const a = img.width / img.height;
      let w = maxW;
      let h = w / a;
      if (h > maxH) {
        h = maxH;
        w = h * a;
      }
      mat.map = tex;
      mat.needsUpdate = true;
      plane.scale.set(w, h, 1);
      plane.position.z = 0.3;
      frame.scale.set(w + 0.8, h + 0.8, 0.5);
      addBulbs(g, w + 0.8, h + 0.8, 0.35);
      S.pulses.push({ mat, phase: Math.random() * 6, flicker: !!flicker });
      g.visible = true;
    });

    return g;
  }

  /* animated GIF sign (browser animates a hidden <img>; the current
     frame is copied to a canvas while the car is near) */
  function makeGifSign(path, w, activeDist) {
    const W = 512;
    const H = 288;
    const h = (w * H) / W;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#05070d";
      ctx.fillRect(0, 0, W, H);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const g = new THREE.Group();
    g.visible = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
    const plane = new THREE.Mesh(S.plane, mat);
    plane.scale.set(w, h, 1);
    plane.position.z = 0.3;
    const frame = new THREE.Mesh(S.box, S.frameMat);
    frame.scale.set(w + 0.8, h + 0.8, 0.5);
    g.add(frame);
    g.add(plane);
    addBulbs(g, w + 0.8, h + 0.8, 0.35);

    const gif = {
      img: new Image(), canvas, ctx, tex, W, H,
      ready: false, timer: 0, x: 0, z: 0, dist: activeDist || 150, group: g
    };

    let retried = false;
    gif.img.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;" +
      "pointer-events:none;z-index:-1;";
    gif.img.onload = () => {
      gif.ready = true;
      g.visible = true;
      paintGif(gif);
    };
    gif.img.onerror = () => {
      const alt = lowerExt(path);
      if (!retried && alt !== path) {
        retried = true;
        gif.img.src = alt;
      } else {
        console.warn("CQ promos: image not found: " + path);
      }
    };
    document.body.appendChild(gif.img);
    gif.img.src = path;

    S.gifs.push(gif);
    S.pulses.push({ mat, phase: Math.random() * 6, flicker: false });
    return gif;
  }

  function paintGif(gif) {
    const iw = gif.img.naturalWidth;
    const ih = gif.img.naturalHeight;
    if (!gif.ctx || !iw || !ih) return;
    gif.ctx.fillStyle = "#000000";
    gif.ctx.fillRect(0, 0, gif.W, gif.H);
    const s = Math.min(gif.W / iw, gif.H / ih);
    const dw = iw * s;
    const dh = ih * s;
    gif.ctx.drawImage(gif.img, (gif.W - dw) / 2, (gif.H - dh) / 2, dw, dh);
    gif.tex.needsUpdate = true;
  }

  function neonTex(text, color, w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#07040f";
    g.fillRect(0, 0, w, h);
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let s = Math.floor(h * 0.6);
    g.font = "bold " + s + "px Arial, sans-serif";
    while (g.measureText(text).width > w * 0.88 && s > 10) {
      s -= 4;
      g.font = "bold " + s + "px Arial, sans-serif";
    }
    g.fillText(text, w / 2, h / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function neonSign(text, color, w, h, flicker) {
    const mat = new THREE.MeshBasicMaterial({
      map: neonTex(text, color, 1024, Math.max(64, Math.round((1024 * h) / w))),
      fog: false
    });
    const m = new THREE.Mesh(S.plane, mat);
    m.scale.set(w, h, 1);
    const g = new THREE.Group();
    g.add(m);
    S.pulses.push({ mat, phase: Math.random() * 6, flicker: !!flicker });
    return g;
  }

  function addSpot(x, z, label, r) {
    S.spots.push({ x, z, label, r: r || 38 });
  }

  /* =======================================================
     THE DRESSING
     ======================================================= */
  function dressParty(b) {
    const out = outwardFaces(b);
    const H = heightOf(b);
    const front = facePoint(b, out.z, 0);
    const side = facePoint(b, out.x, 0);

    const sign = makeSign(P.party, Math.min(front.w * 0.85, 12), 7.5, false);
    mount(sign, b, out.z, 0, Math.min(H * 0.55, 8.5), 0.35);

    mount(neonSign("PARTY STORE", "#ffe14a", Math.min(front.w * 0.9, 12), 2.6, false),
      b, out.z, 0, Math.min(H - 1.6, 14), 0.2);

    const sideSign = makeSign(P.partySide, Math.min(side.w * 0.85, 12), 8, false);
    mount(sideSign, b, out.x, 0, Math.min(H * 0.5, 7.5), 0.35);

    addSpot(b.position.x, b.position.z, "THE PARTY STORE");
  }

  function dressArcade(b) {
    const out = outwardFaces(b);
    const H = heightOf(b);
    const front = facePoint(b, out.z, 0);

    const sign = makeSign(P.arcade, Math.min(front.w * 0.85, 12), 7, true);
    mount(sign, b, out.z, 0, Math.min(H * 0.55, 8.5), 0.35);

    mount(neonSign("ARCADE", "#00eaff", Math.min(front.w * 0.9, 11), 2.6, true),
      b, out.z, 0, Math.min(H - 1.6, 14), 0.2);
    mount(neonSign("INSERT COIN", "#ff2bd6", Math.min(front.w * 0.8, 9), 1.0, true),
      b, out.z, 0, 4.7, 0.25);

    addSpot(b.position.x, b.position.z, "THE ARCADE");
  }

  function dressRadio(b) {
    const out = outwardFaces(b);
    const H = heightOf(b);
    const front = facePoint(b, out.z, 0);
    const w = Math.min(front.w * 0.85, 12);

    const gif = makeGifSign(P.radio, w, 150);
    const p = mount(gif.group, b, out.z, 0, Math.min(H * 0.55, 9), 0.4);
    gif.x = p.x;
    gif.z = p.z;

    mount(neonSign("ON AIR", "#ff3b3b", Math.min(front.w * 0.6, 7), 1.6, true),
      b, out.z, 0, Math.min(H - 1.2, 15), 0.25);

    addSpot(b.position.x, b.position.z, "RADIO STATION");
  }

  function dressMall(b) {
    const out = outwardFaces(b);
    const H = heightOf(b);
    const front = facePoint(b, out.z, 0);

    const sign = makeSign(P.mall, Math.min(front.w * 0.6, 14), 7, false);
    mount(sign, b, out.z, 0, Math.min(H * 0.6, 9), 0.35);

    mount(neonSign("SHOPPING CENTER", "#22ff66", Math.min(front.w * 0.9, 14), 2.6, false),
      b, out.z, 0, Math.min(H - 1.6, 14), 0.2);

    addSpot(b.position.x, b.position.z, "SHOPPING CENTER");
  }

  function dressBillboard(b) {
    const out = outwardFaces(b);
    const H = heightOf(b);
    const front = facePoint(b, out.z, 0);
    const w = Math.min(front.w * 0.95, 16);
    const h = (w * 9) / 16;

    const gif = makeGifSign(P.billboard, w, 220);
    const p = mount(gif.group, b, out.z, 0, H + h / 2 + 0.8, -0.9);
    gif.x = p.x;
    gif.z = p.z;

    addSpot(b.position.x, b.position.z, "NOW ON BIG G STV", 60);
  }

  function dressBusStop(b) {
    const out = outwardFaces(b);
    const front = facePoint(b, out.z, 0);
    const g = new THREE.Group();

    const mk = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(S.box, S.frameMat);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      g.add(m);
    };
    mk(4.4, 0.18, 2.0, 0, 2.7, 0.2);   /* roof */
    mk(0.14, 2.6, 0.14, -2.1, 1.3, 1.0);
    mk(0.14, 2.6, 0.14, 2.1, 1.3, 1.0);
    mk(3.4, 0.16, 0.7, 0, 0.55, -0.3);   /* bench */

    const ad = makeSign(P.busStop, 3.4, 2.0, false);
    ad.position.set(0, 1.5, -0.75);
    g.add(ad);

    const label = neonSign("BUS STOP", "#00eaff", 2.4, 0.5, false);
    label.position.set(0, 2.95, 1.25);
    g.add(label);

    mount(g, b, out.z, front.w * 0.28, 0, 2.4);
    addSpot(b.position.x, b.position.z, "BUS STOP", 30);
  }

  /* =======================================================
     BUS (best effort: finds objects named like a bus)
     ======================================================= */
  function findBuses() {
    let root = S.track.group;
    while (root.parent) root = root.parent;
    const found = [];
    root.traverse(o => {
      const n = o.name || "";
      if (!/bus/i.test(n) || /stop/i.test(n) || /^CQ_/i.test(n)) return;
      if (!(o.isGroup || o.isMesh)) return;
      if (o.userData.cqBusPromo) return;
      /* skip children of an already-found bus */
      let p = o.parent;
      while (p) {
        if (found.indexOf(p) >= 0 || (p.userData && p.userData.cqBusPromo)) return;
        p = p.parent;
      }
      found.push(o);
    });
    return found;
  }

  function dressBus(bus) {
    bus.userData.cqBusPromo = true;

    const keepQ = bus.quaternion.clone();
    bus.quaternion.identity();
    bus.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bus);
    const pos = bus.getWorldPosition(new THREE.Vector3());
    const sc = bus.getWorldScale(new THREE.Vector3());
    bus.quaternion.copy(keepQ);
    bus.updateMatrixWorld(true);

    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3()).sub(pos);
    const lsize = new THREE.Vector3(size.x / sc.x, size.y / sc.y, size.z / sc.z);
    const lctr = new THREE.Vector3(ctr.x / sc.x, ctr.y / sc.y, ctr.z / sc.z);

    if (lsize.x < 2 && lsize.z < 2) {
      console.warn("CQ promos: bus object too small, skipped:", bus.name);
      return;
    }

    const lengthAlongX = lsize.x >= lsize.z;
    const length = lengthAlongX ? lsize.x : lsize.z;
    const width = lengthAlongX ? lsize.z : lsize.x;

    [1, -1].forEach(side => {
      const m = new THREE.Group();
      m.visible = false;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      const plane = new THREE.Mesh(S.plane, mat);
      m.add(plane);
      loadImage(P.bus, (tex, img) => {
        const a = img.width / img.height;
        let w = length * 0.62;
        let h = w / a;
        const maxH = lsize.y * 0.55;
        if (h > maxH) {
          h = maxH;
          w = h * a;
        }
        mat.map = tex;
        mat.needsUpdate = true;
        plane.scale.set(w, h, 1);
        m.visible = true;
      });
      const off = width / 2 + 0.06;
      if (lengthAlongX) {
        m.position.set(lctr.x, lctr.y, lctr.z + side * off);
        m.rotation.y = side > 0 ? 0 : Math.PI;
      } else {
        m.position.set(lctr.x + side * off, lctr.y, lctr.z);
        m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      bus.add(m);
    });
  }

  function tryBuses() {
    findBuses().forEach(dressBus);
  }

  /* =======================================================
     BUILD (runs once, right after cityvisuals.apply)
     ======================================================= */
  function build(track) {
    S.track = track;
    S.root = new THREE.Group();
    S.root.name = "CQ_Promos";
    track.group.add(S.root);

    S.plane = new THREE.PlaneGeometry(1, 1);
    S.box = new THREE.BoxGeometry(1, 1, 1);
    S.bulbGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    S.frameMat = new THREE.MeshStandardMaterial({ color: 0x0b0e18, roughness: 0.6, metalness: 0.5 });
    S.matA = new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false });
    S.matB = new THREE.MeshBasicMaterial({ color: 0x4a3d10, fog: false });

    const loc = window.CQLocations;
    const get = id => (loc && loc.get ? loc.get(id) : null);

    const rec = get("record_store");
    const center = rec ? { x: rec.position.x, z: rec.position.z } : { x: 156, z: -156 };
    const theatre = get("movie_theatre");
    const radioLoc = get("radio_station");

    const used = new Set();
    if (theatre && theatre.building) used.add(theatre.building);

    const usable = b =>
      b.geometry && b.geometry.parameters && b.userData &&
      !b.userData.destination && !used.has(b);
    const free = zone =>
      track.buildings.filter(b => usable(b) && b.userData.cqZone === zone);
    const dist = (b, c) => Math.hypot(b.position.x - c.x, b.position.z - c.z);
    const minDim = b => Math.min(b.geometry.parameters.width, b.geometry.parameters.depth);
    const safe = (name, fn) => {
      try { fn(); } catch (e) { console.error("CQ promos: " + name + " failed", e); }
    };

    /* entertainment district: party store + arcade */
    const ent = free("entertainment").sort((a, b) => dist(a, center) - dist(b, center));
    const party = ent.find(b => dist(b, center) >= 25 && minDim(b) >= 10) || ent[0];
    if (party) {
      used.add(party);
      safe("party", () => dressParty(party));
    }
    const arcade = free("entertainment")
      .sort((a, b) => dist(a, center) - dist(b, center))
      .find(b => dist(b, center) >= 25 && minDim(b) >= 10 &&
                 (!party || dist(b, party.position) >= 35));
    if (arcade) {
      used.add(arcade);
      safe("arcade", () => dressArcade(arcade));
    }

    /* radio station: the real landmark, or a building typed radio_station */
    const radio =
      (radioLoc && radioLoc.building) ||
      track.buildings.find(b => b.userData && b.userData.buildingType === "radio_station" &&
                                b.geometry && b.geometry.parameters);
    if (radio) {
      if (!radio.userData.cqHeight) radio.userData.cqHeight = radio.geometry.parameters.height * radio.scale.y;
      used.add(radio);
      safe("radio", () => dressRadio(radio));
    } else {
      console.warn("CQ promos: no radio station building found");
    }

    /* shopping center: biggest footprint in the general zone */
    const mall = free("general").sort((a, b) =>
      b.geometry.parameters.width * b.geometry.parameters.depth -
      a.geometry.parameters.width * a.geometry.parameters.depth)[0];
    if (mall) {
      used.add(mall);
      safe("mall", () => dressMall(mall));
    }

    /* downtown: skip the HQ (closest to centre), billboard on the tallest,
       bus stop beside another */
    const dt = free("downtown").sort((a, b) =>
      Math.hypot(a.position.x, a.position.z) - Math.hypot(b.position.x, b.position.z)).slice(1);
    const tall = dt.slice().sort((a, b) => heightOf(b) - heightOf(a))[0];
    if (tall) {
      used.add(tall);
      safe("billboard", () => dressBillboard(tall));
    }
    const stopB = dt.find(b => b !== tall);
    if (stopB) {
      used.add(stopB);
      safe("busStop", () => dressBusStop(stopB));
    }

    /* toast element */
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:25;" +
      "font:800 14px/1 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;" +
      "color:#fff;background:rgba(7,4,15,.78);border:1px solid #ff2bd6;" +
      "box-shadow:0 0 16px #ff2bd6;padding:10px 16px;border-radius:4px;" +
      "pointer-events:none;opacity:0;transition:opacity .35s;";
    document.body.appendChild(el);
    S.toast = el;

    tryBuses();
  }

  /* =======================================================
     UPDATE (once per frame via CQHooks)
     ======================================================= */
  function update(delta, car) {
    if (!S.root) return;
    S.t += delta;

    /* pulse / flicker */
    for (let i = 0; i < S.pulses.length; i++) {
      const p = S.pulses[i];
      const v = p.flicker
        ? (Math.sin(S.t * 23 + p.phase) > 0.93 ? 0.4 : 0.95 + 0.05 * Math.sin(S.t * 5 + p.phase))
        : 0.84 + 0.16 * Math.sin(S.t * 3 + p.phase);
      p.mat.color.setScalar(v);
    }

    /* chasing bulbs */
    S.bulbTimer += delta;
    if (S.bulbTimer >= 0.3) {
      S.bulbTimer = 0;
      S.bulbFlip = !S.bulbFlip;
      S.matA.color.setHex(S.bulbFlip ? 0xfff2b0 : 0x4a3d10);
      S.matB.color.setHex(S.bulbFlip ? 0x4a3d10 : 0xfff2b0);
    }

    /* animated GIFs, only while the car is near */
    for (let i = 0; i < S.gifs.length; i++) {
      const gif = S.gifs[i];
      if (!gif.ready) continue;
      const dx = car.x - gif.x;
      const dz = car.z - gif.z;
      if (dx * dx + dz * dz < gif.dist * gif.dist) {
        gif.timer += delta;
        if (gif.timer >= 0.1) {
          gif.timer = 0;
          paintGif(gif);
        }
      }
    }

    /* "now showing" toast when driving up to a promo */
    let nearest = null;
    let best = Infinity;
    for (let i = 0; i < S.spots.length; i++) {
      const s = S.spots[i];
      const d = Math.hypot(car.x - s.x, car.z - s.z);
      if (d < s.r && d < best) {
        best = d;
        nearest = s;
      }
    }
    if (nearest && nearest !== S.lastSpot && S.toast) {
      S.toast.textContent = nearest.label;
      S.toast.style.opacity = "1";
      S.toastTimer = 2.6;
    }
    S.lastSpot = nearest;
    if (S.toastTimer > 0) {
      S.toastTimer -= delta;
      if (S.toastTimer <= 0 && S.toast) S.toast.style.opacity = "0";
    }

    /* bus NPCs may spawn after the city is built: keep looking a while */
    S.busTimer += delta;
    if (S.busTimer >= 3 && S.busTries < 20) {
      S.busTimer = 0;
      S.busTries++;
      tryBuses();
      if (S.busTries === 20) console.info("CQ promos: bus search finished");
    }
  }

  /* =======================================================
     INSTALL
     ======================================================= */
  const V = window.CQCityVisuals;
  if (!V || !V.apply) {
    console.warn("CQ promos: load promos.js AFTER cityvisuals.js");
  } else if (!V.__promosWrapped) {
    const original = V.apply;
    V.apply = function () {
      const result = original.apply(this, arguments);
      try {
        build(arguments[0]);
      } catch (e) {
        console.error("CQ promos failed:", e);
      }
      return result;
    };
    V.__promosWrapped = true;
  }

  if (window.CQHooks) {
    window.CQHooks.register(update);
  }

  window.CQPromos = { build, update, files: P };
})();
