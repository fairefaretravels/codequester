
/* CODEQUESTER — ENERGY VAMPIRES add-on.
   Load after main.js.
*/
(() => {
  "use strict";

  const world = window.CQWorld;

  if (!world || !world.scene || !world.car || !world.THREE) {
    console.warn("CodeQuestER: Energy Vampires need CQWorld from main.js.");
    return;
  }

  const { scene, car, THREE } = world;
  const locations = world.locations || [];

  const state = {
    energy: 100,
    maxEnergy: 100,
    gameOver: false,
    enemies: [],
    safe: false
  };

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;left:14px;bottom:100px;z-index:29;width:190px;" +
    "box-sizing:border-box;padding:10px 12px;border-radius:9px;" +
    "font:bold 12px Arial,sans-serif;letter-spacing:.7px;color:#fff;" +
    "background:rgba(4,7,13,.9);border:1px solid rgba(255,45,80,.75);" +
    "pointer-events:none";

  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;margin-bottom:7px">' +
    '<span>ENERGY</span><span id="cq-ev-value">100%</span></div>' +
    '<div style="height:8px;background:#242832;border-radius:8px;overflow:hidden">' +
    '<div id="cq-ev-fill" style="height:100%;width:100%;background:#39f5d0"></div></div>' +
    '<div id="cq-ev-status" style="margin-top:7px;font-size:10px;color:#a9b6c8">' +
    'NO THREAT DETECTED</div>';

  document.body.appendChild(panel);

  const valueEl = panel.querySelector("#cq-ev-value");
  const fillEl = panel.querySelector("#cq-ev-fill");
  const statusEl = panel.querySelector("#cq-ev-status");

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:60;display:none;align-items:center;" +
    "justify-content:center;padding:24px;box-sizing:border-box;" +
    "background:rgba(0,0,0,.86);color:#fff;text-align:center;" +
    "font-family:Arial,sans-serif";

  overlay.innerHTML =
    '<div style="max-width:360px;border:1px solid #ff3158;border-radius:14px;' +
    'padding:24px;background:#080b12">' +
    '<div style="font-size:12px;letter-spacing:4px;color:#ff3158">ENERGY DEPLETED</div>' +
    '<h2 style="font-size:28px;margin:12px 0">THEY CAUGHT YOU</h2>' +
    '<p style="color:#c4cad4;line-height:1.5">The Energy Vampires drained your power. ' +
    'Recharge and try again.</p>' +
    '<button id="cq-ev-restart" type="button" style="padding:12px 18px;' +
    'border:0;border-radius:8px;background:#ff3158;color:#fff;' +
    'font-weight:bold;font-size:14px">RECHARGE &amp; CONTINUE</button></div>';

  document.body.appendChild(overlay);

  function placeEnemy(enemy, distance) {
    const angle = Math.random() * Math.PI * 2;

    enemy.group.position.set(
      car.position.x + Math.cos(angle) * distance,
      0,
      car.position.z + Math.sin(angle) * distance
    );

    enemy.respawn = 0;
  }

  overlay.querySelector("#cq-ev-restart").addEventListener("click", () => {
    state.energy = state.maxEnergy;
    state.gameOver = false;

    state.enemies.forEach((enemy, i) => {
      placeEnemy(enemy, 38 + i * 8);
    });

    overlay.style.display = "none";
    updatePanel();
  });

  function makeEnemy(index) {
    const group = new THREE.Group();
    group.name = "EnergyVampire_" + (index + 1);

    const dark = new THREE.MeshStandardMaterial({
      color: 0x090711,
      roughness: 0.92,
      transparent: true,
      opacity: 0.94,
      emissive: 0x170014,
      emissiveIntensity: 0.7
    });

    const torso = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 12, 10),
      dark
    );

    torso.scale.set(0.72, 1.25, 0.55);
    torso.position.y = 1.65;
    group.add(torso);

    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.92, 1.35, 7),
      dark
    );

    hood.position.set(0, 2.7, 0.02);
    group.add(hood);

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xff174f
    });

    [-0.27, 0.27].forEach(x => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        eyeMat
      );

      eye.position.set(x, 2.35, -0.48);
      group.add(eye);
    });

    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0x9a063f,
        transparent: true,
        opacity: 0.11,
        wireframe: true,
        depthWrite: false
      })
    );

    aura.position.y = 1.5;
    group.add(aura);
    scene.add(group);

    const enemy = {
      group,
      phase: index * 2.2,
      index,
      respawn: 0
    };

    placeEnemy(enemy, 34 + index * 12);
    return enemy;
  }

  function isSafeZone() {
    for (const location of locations) {
      if (
        location.id !== "garage" &&
        location.id !== "tech_hub"
      ) continue;

      if (!location.position) continue;

      const dx = Math.max(
        Math.abs(car.position.x - location.position.x) -
          (Number(location.halfWidth) || 0),
        0
      );

      const dz = Math.max(
        Math.abs(car.position.z - location.position.z) -
          (Number(location.halfDepth) || 0),
        0
      );

      if (Math.hypot(dx, dz) < 19) return true;
    }

    return false;
  }

  function updatePanel(distance = Infinity) {
    const n = Math.max(0, Math.round(state.energy));

    valueEl.textContent = n + "%";
    fillEl.style.width = n + "%";

    fillEl.style.background =
      n <= 25 ? "#ff3158" :
      n <= 55 ? "#ffbd4a" :
      "#39f5d0";

    if (state.gameOver) {
      statusEl.textContent = "RECHARGE REQUIRED";
      statusEl.style.color = "#ff3158";
    } else if (state.safe) {
      statusEl.textContent = "SAFE ZONE — RECHARGING";
      statusEl.style.color = "#39f5d0";
    } else if (distance < 13) {
      statusEl.textContent = "DANGER — GET AWAY";
      statusEl.style.color = "#ff3158";
    } else if (distance < 27) {
      statusEl.textContent = "HOSTILE ENERGY NEARBY";
      statusEl.style.color = "#ffbd4a";
    } else {
      statusEl.textContent = "ESCAPE TO RECHARGE";
      statusEl.style.color = "#a9b6c8";
    }
  }

  state.enemies = [
    makeEnemy(0),
    makeEnemy(1),
    makeEnemy(2)
  ];

  function update(delta) {
    if (state.gameOver) return;

    const step = Math.min(Math.max(delta || 0, 0), 0.05);
    state.safe = isSafeZone();

    let nearest = Infinity;

    for (const enemy of state.enemies) {
      const g = enemy.group;

      const dx = car.position.x - g.position.x;
      const dz = car.position.z - g.position.z;
      const d = Math.hypot(dx, dz);

      nearest = Math.min(nearest, d);

      if (d > 0.001) {
        const speed = d < 13 ? 3.1 : 5.2;

        g.position.x += (dx / d) * speed * step;
        g.position.z += (dz / d) * speed * step;
        g.rotation.y = Math.atan2(-dx, -dz);
      }

      enemy.phase += step * 3.5;
      g.position.y = Math.sin(enemy.phase) * 0.22;
      g.rotation.z = Math.sin(enemy.phase * 0.6) * 0.06;

      if (d < 13 && !state.safe) {
        state.energy = Math.max(
          0,
          state.energy - 13 * step
        );
      }

      if (d < 3.5) {
        enemy.respawn += step;

        if (enemy.respawn > 2.6) {
          placeEnemy(enemy, 44 + enemy.index * 9);
        }
      } else {
        enemy.respawn = 0;
      }
    }

    if (state.safe) {
      state.energy = Math.min(100, state.energy + 18 * step);
    } else if (nearest >= 13) {
      state.energy = Math.min(100, state.energy + 3.5 * step);
    }

    updatePanel(nearest);

    if (state.energy <= 0) {
      state.gameOver = true;
      overlay.style.display = "flex";
      statusEl.textContent = "RECHARGE REQUIRED";
    }
  }

  window.CQEnergyVampires = {
    update,
    getEnergy: () => state.energy
  };
})();
