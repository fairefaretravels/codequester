/* =========================================================
   CODEQUESTER — ENERGY VAMPIRES + COMBAT + LEVELS
   Load AFTER main.js. Needs window.CQWorld from main.js.
   ========================================================= */
(() => {
  "use strict";
  const world = window.CQWorld;
  if (!world || !world.scene || !world.car || !world.THREE) {
    console.warn("CodeQuestER: Energy Vampires need CQWorld from main.js.");
    return;
  }
  const { scene, car, THREE } = world;
  const locations = world.locations || [];
  const waypoints = world.waypoints || [];
  const game = window.CQGame || {};
  const STORAGE_KEY = "codequester.combat.v1";
  const WEAPONS = {
    slingshot: { name: "SLINGSHOT", price: 50, damage: 1, range: 52, ammoUse: 1, ownedByDefault: false, description: "Cheap, reliable starter weapon" },
    pistol: { name: "PISTOL", price: 250, damage: 2, range: 76, ammoUse: 1, ownedByDefault: false, description: "Balanced damage and range" },
    shotgun: { name: "SHOTGUN", price: 600, damage: 3, range: 32, ammoUse: 3, ownedByDefault: false, description: "Heavy damage at close range" }
  };
  const state = {
    energy: 100, maxEnergy: 100, gameOver: false, enemies: [], safe: false,
    cash: 0, ammo: 8, level: 1, activeWeapon: "slingshot", kills: {},
    owned: { slingshot: false, pistol: false, shotgun: false },
    bullets: [], lastLap: Number(game.lap) || 1, fireCooldown: 0,
    message: "Collect silver bullets. Defeat each vampire twice to unlock Level 2."
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      state.cash = Math.max(0, Number(saved.cash) || 0);
      state.ammo = Math.max(0, Number(saved.ammo) || 0);
      state.level = saved.level >= 2 ? 2 : 1;
      state.owned = { slingshot: !!saved.owned?.slingshot, pistol: !!saved.owned?.pistol, shotgun: !!saved.owned?.shotgun };
      state.activeWeapon = state.owned[saved.activeWeapon] ? saved.activeWeapon : "slingshot";
      state.kills = saved.kills && typeof saved.kills === "object" ? saved.kills : {};
    }
  } catch (_) { /* storage unavailable: progress remains for this session */ }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ cash:state.cash, ammo:state.ammo, level:state.level, owned:state.owned, activeWeapon:state.activeWeapon, kills:state.kills })); } catch (_) {}
  }
  function makePanel() {
    const panel = document.createElement("div");
    panel.id = "cq-combat-panel";
    panel.style.cssText = "position:fixed;left:12px;top:155px;z-index:28;width:min(230px,calc(100vw - 24px));box-sizing:border-box;padding:10px 12px;border-radius:10px;font: bold 11px Arial,sans-serif;letter-spacing:.5px;color:#fff;background:rgba(4,7,13,.92);border:1px solid rgba(0,234,255,.55);box-shadow:0 0 18px rgba(0,234,255,.08);";
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><span>LEVEL <b id="cq-level">1</b></span><span>CASH $<b id="cq-cash">0</b></span></div><div style="margin-top:7px">SILVER BULLETS: <b id="cq-ammo">8</b></div><div style="margin-top:6px">WEAPON: <b id="cq-weapon">SLINGSHOT</b></div><div style="height:7px;margin-top:8px;background:#262a34;border-radius:8px;overflow:hidden"><div id="cq-energy-fill" style="height:100%;width:100%;background:#39f5d0"></div></div><div style="display:flex;justify-content:space-between;margin-top:4px"><span>ENERGY</span><span id="cq-energy">100%</span></div><div id="cq-combat-status" style="margin-top:7px;font-size:10px;line-height:1.4;color:#b8c4d5">'+state.message+'</div><div id="cq-kill-count" style="margin-top:5px;font-size:10px;color:#ff879e"></div>';
    document.body.appendChild(panel); return panel;
  }
  const panel = makePanel();
  const $ = id => panel.querySelector("#" + id);
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;padding:22px;box-sizing:border-box;background:rgba(0,0,0,.86);color:#fff;text-align:center;font-family:Arial,sans-serif";
  overlay.innerHTML = '<div style="max-width:370px;border:1px solid #ff3158;border-radius:14px;padding:24px;background:#080b12"><div style="font-size:12px;letter-spacing:4px;color:#ff3158">ENERGY DEPLETED</div><h2 style="font-size:27px;margin:12px 0">THEY CAUGHT YOU</h2><p style="color:#c4cad4;line-height:1.5">Your energy ran out. Recharge and get back into the hunt.</p><button id="cq-recharge" style="padding:12px 18px;border:0;border-radius:8px;background:#ff3158;color:#fff;font-weight:bold">RECHARGE &amp; CONTINUE</button></div>';
  document.body.appendChild(overlay);
  overlay.querySelector("#cq-recharge").addEventListener("click", () => {
    state.energy=100; state.gameOver=false;
    state.enemies.forEach((e,i)=>{ if(!e.dead) placeEnemy(e,38+i*8); });
    overlay.style.display="none"; renderUI();
  });

  const notice = document.createElement("div");
  notice.style.cssText = "position:fixed;left:50%;top:22%;transform:translate(-50%,-50%);z-index:55;max-width:88vw;padding:10px 14px;border:1px solid #ff2bd6;border-radius:9px;background:rgba(0,0,0,.88);color:#fff;font:bold 13px Arial,sans-serif;text-align:center;pointer-events:none;display:none";
  document.body.appendChild(notice);
  let noticeTimer=0;
  function say(text, seconds=2.1) { notice.textContent=text; notice.style.display="block"; noticeTimer=seconds; state.message=text; }

  const shop = document.createElement("div");
  shop.style.cssText = "position:fixed;right:12px;top:155px;z-index:35;width:min(220px,calc(100vw - 24px));box-sizing:border-box;padding:10px;border:1px solid rgba(255,43,214,.6);border-radius:10px;background:rgba(4,7,13,.94);color:#fff;font:11px Arial,sans-serif;";
  shop.innerHTML = '<div style="font-weight:bold;letter-spacing:1.5px;margin-bottom:7px">WEAPON SHOP</div><div id="cq-shop-items"></div><button id="cq-shop-toggle" style="margin-top:7px;width:100%;padding:7px;border-radius:7px;border:1px solid #7b5cff;background:#17112b;color:#fff;font-weight:bold">HIDE SHOP</button>';
  document.body.appendChild(shop);
  const shopItems=shop.querySelector("#cq-shop-items");
  shop.querySelector("#cq-shop-toggle").addEventListener("click",()=>{
    const hidden=shopItems.style.display==="none"; shopItems.style.display=hidden?"block":"none";
    shop.querySelector("#cq-shop-toggle").textContent=hidden?"HIDE SHOP":"OPEN WEAPON SHOP";
  });

  function renderShop() {
    shopItems.innerHTML="";
    Object.keys(WEAPONS).forEach(key=>{
      const w=WEAPONS[key]; const owned=state.owned[key];
      const row=document.createElement("div");
      row.style.cssText="padding:7px 0;border-top:1px solid #292536;line-height:1.35";
      const action=document.createElement("button"); action.type="button";
      action.style.cssText="width:100%;margin-top:5px;padding:7px;border-radius:6px;border:1px solid #51456e;background:"+(owned?"#153c36":"#17112b")+";color:#fff;font-weight:bold;font-size:10px";
      action.textContent=owned?(state.activeWeapon===key?"EQUIPPED — SELECTED":"EQUIP "+w.name):"BUY — $"+w.price;
      action.addEventListener("click",()=>{
        if(owned){state.activeWeapon=key;say(w.name+" EQUIPPED");}
        else if(state.cash<w.price){say("NOT ENOUGH CASH — RACE TO EARN MORE");}
        else {state.cash-=w.price;state.owned[key]=true;state.activeWeapon=key;say(w.name+" PURCHASED — KEPT PERMANENTLY");}
        save();renderShop();renderUI();
      });
      row.append(document.createTextNode(w.name+" — $"+w.price+(owned?" · OWNED":"")));
      const desc=document.createElement("div");desc.style.cssText="color:#aeb8c8;margin-top:2px";desc.textContent=w.description+" · Damage "+w.damage;
      row.appendChild(desc);row.appendChild(action);shopItems.appendChild(row);
    });
  }

  function renderUI(distance=Infinity) {
    $("cq-level").textContent=state.level; $("cq-cash").textContent=state.cash;
    $("cq-ammo").textContent=state.ammo; $("cq-weapon").textContent=WEAPONS[state.activeWeapon].name;
    $("cq-energy").textContent=Math.round(state.energy)+"%";
    $("cq-energy-fill").style.width=state.energy+"%";
    $("cq-energy-fill").style.background=state.energy<=25?"#ff3158":state.energy<=55?"#ffbd4a":"#39f5d0";
    $("cq-combat-status").textContent=state.safe?"SAFE ZONE — ENERGY RECHARGING":distance<13?"DANGER — DRIVE AWAY OR SHOOT":"Collect silver bullets · Finish laps for cash";
    $("cq-kill-count").textContent=state.level>=2?"LEVEL 2 UNLOCKED":state.enemies.filter(e=>!e.dead).length+" active · Defeat each vampire twice";
  }

  function placeEnemy(enemy, distance) {
    const angle=Math.random()*Math.PI*2;
    enemy.group.position.set(car.position.x+Math.cos(angle)*distance,0,car.position.z+Math.sin(angle)*distance);
    enemy.respawn=0;
  }
  function makeEnemy(index) {
    const group=new THREE.Group();group.name="EnergyVampire_"+(index+1);
    const dark=new THREE.MeshStandardMaterial({color:0x090711,roughness:.92,transparent:true,opacity:.94,emissive:0x170014,emissiveIntensity:.7});
    const torso=new THREE.Mesh(new THREE.SphereGeometry(1.25,12,10),dark);torso.scale.set(.72,1.25,.55);torso.position.y=1.65;group.add(torso);
    const hood=new THREE.Mesh(new THREE.ConeGeometry(.92,1.35,7),dark);hood.position.set(0,2.7,.02);group.add(hood);
    const eyeMat=new THREE.MeshBasicMaterial({color:0xff174f});
    [-.27,.27].forEach(x=>{const eye=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),eyeMat);eye.position.set(x,2.35,-.48);group.add(eye);});
    const aura=new THREE.Mesh(new THREE.SphereGeometry(1.8,10,8),new THREE.MeshBasicMaterial({color:0x9a063f,transparent:true,opacity:.11,wireframe:true,depthWrite:false}));aura.position.y=1.5;group.add(aura);scene.add(group);
    const enemy={group,phase:index*2.2,index,respawn:0,dead:false,hits:0,kills:Number(state.kills[index])||0};placeEnemy(enemy,34+index*12);return enemy;
  }
  function isSafeZone() {
    for(const l of locations){if((l.id!=="garage"&&l.id!=="tech_hub")||!l.position)continue;const dx=Math.max(Math.abs(car.position.x-l.position.x)-(Number(l.halfWidth)||0),0);const dz=Math.max(Math.abs(car.position.z-l.position.z)-(Number(l.halfDepth)||0),0);if(Math.hypot(dx,dz)<19)return true;}return false;
  }

  function makeBulletPickup(position) {
    const group=new THREE.Group();
    const silver=new THREE.MeshStandardMaterial({color:0xdde8f5,metalness:.95,roughness:.18,emissive:0x435b70,emissiveIntensity:.35});
    const bullet=new THREE.Mesh(new THREE.CylinderGeometry(.16,.11,.68,8),silver);bullet.rotation.z=Math.PI/2;group.add(bullet);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.52,.035,6,16),new THREE.MeshBasicMaterial({color:0x7eeaff,transparent:true,opacity:.85}));ring.rotation.x=Math.PI/2;group.add(ring);
    group.position.copy(position);group.position.y=1.1;scene.add(group);state.bullets.push({group,active:true,respawn:0,phase:Math.random()*6});
  }
  function seedPickups() {
    if(waypoints.length>0){
      const count=Math.min(18,Math.max(8,Math.floor(waypoints.length/10)));
      for(let i=0;i<count;i++){const p=waypoints[Math.floor(i*waypoints.length/count)];makeBulletPickup(new THREE.Vector3(p.x+(i%2?4:-4),0,p.z));}
    } else {
      for(let i=0;i<10;i++){const a=i*Math.PI*2/10;makeBulletPickup(new THREE.Vector3(car.position.x+Math.cos(a)*25,0,car.position.z+Math.sin(a)*25));}
    }
  }
  function collectBullets(delta) {
    for(const pickup of state.bullets){
      pickup.phase+=.05;pickup.group.rotation.y+=.025;pickup.group.position.y=1.1+Math.sin(pickup.phase)*.18;
      if(pickup.active&&Math.hypot(car.position.x-pickup.group.position.x,car.position.z-pickup.group.position.z)<3.4){
        pickup.active=false;pickup.respawn=22;pickup.group.visible=false;state.ammo+=3;say("SILVER BULLETS +3");save();
      }else if(!pickup.active){pickup.respawn-=delta;if(pickup.respawn<=0){pickup.active=true;pickup.group.visible=true;}}
    }
  }

  function shoot() {
    if(state.gameOver||state.fireCooldown>0)return;
    const weapon=WEAPONS[state.activeWeapon];
    if(!state.owned[state.activeWeapon]){say("BUY THE SLINGSHOT IN THE WEAPON SHOP FIRST");return;}
    if(state.ammo<weapon.ammoUse){say("OUT OF SILVER BULLETS — COLLECT MORE");return;}
    state.ammo-=weapon.ammoUse;state.fireCooldown=state.activeWeapon==="shotgun"?.85:.48;
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(car.quaternion).normalize();
    const origin=car.position.clone();origin.y+=1.5;
    let target=null,best=weapon.range;
    for(const enemy of state.enemies){if(enemy.dead)continue;
      const to=new THREE.Vector3(enemy.group.position.x-origin.x,1.5,enemy.group.position.z-origin.z);
      const d=Math.hypot(to.x,to.z);if(d>best||d<.1)continue;
      const dot=(to.x*forward.x+to.z*forward.z)/d;
      const minDot=state.activeWeapon==="shotgun"?.48:.78;
      if(dot>minDot){best=d;target=enemy;}
    }
    if(target){
      target.hits+=weapon.damage;
      const needed=state.level===1?2:3;
      say("SILVER HIT — "+Math.min(target.hits,needed)+" / "+needed);
      if(target.hits>=needed)defeatEnemy(target);
    } else say("SHOT FIRED — NO TARGET IN SIGHT");
    save();renderUI();
  }
  function defeatEnemy(enemy) {
    enemy.dead=true;enemy.group.visible=false;enemy.respawn=2.2;
    enemy.kills++;state.kills[enemy.index]=enemy.kills;state.cash+=35;
    say("VAMPIRE DEFEATED · +$35");
    if(state.enemies.every(e=>e.kills>=2)&&state.level===1){
      state.level=2;state.cash+=250;state.enemies.forEach(e=>{e.hits=0;e.dead=false;e.group.visible=true;placeEnemy(e,45+e.index*12);});
      say("LEVEL 2 UNLOCKED · BONUS $250",3.5);
    }
    save();renderShop();renderUI();
  }
  function updateEnemies(delta) {
    let nearest=Infinity;
    for(const enemy of state.enemies){
      if(enemy.dead){enemy.respawn-=delta;if(enemy.respawn<=0&&state.level===1){enemy.dead=false;enemy.hits=0;enemy.group.visible=true;placeEnemy(enemy,42+enemy.index*8);}continue;}
      const g=enemy.group,dx=car.position.x-g.position.x,dz=car.position.z-g.position.z,d=Math.hypot(dx,dz);nearest=Math.min(nearest,d);
      if(d>.001){const speed=d<13?3.1:5.2;g.position.x+=dx/d*speed*delta;g.position.z+=dz/d*speed*delta;g.rotation.y=Math.atan2(-dx,-dz);}
      enemy.phase+=delta*3.5;g.position.y=Math.sin(enemy.phase)*.22;g.rotation.z=Math.sin(enemy.phase*.6)*.06;
      if(d<13&&!state.safe)state.energy=Math.max(0,state.energy-13*delta);
      if(d<3.5){enemy.respawn+=delta;if(enemy.respawn>2.6)placeEnemy(enemy,44+enemy.index*9);}else enemy.respawn=0;
    }
    if(state.safe)state.energy=Math.min(100,state.energy+18*delta);else if(nearest>=13)state.energy=Math.min(100,state.energy+3.5*delta);
    if(state.energy<=0&&!state.gameOver){state.gameOver=true;overlay.style.display="flex";}
    return nearest;
  }
  function updateRaceRewards() {
    const lap=Number(game.lap)||state.lastLap;
    if(lap>state.lastLap){const earned=100;state.cash+=earned;state.lastLap=lap;say("LAP COMPLETE · RACE EARNINGS +$"+earned,2.6);save();renderShop();}
  }

  /* Controls: SPACE / FIRE button. Shooting aims toward enemies in front of the car. */
  window.addEventListener("keydown",e=>{if(e.code==="Space"&&!e.repeat){e.preventDefault();shoot();}});
  const fire=document.createElement("button");fire.type="button";fire.textContent="FIRE";
  fire.style.cssText="position:fixed;right:18px;bottom:95px;z-index:36;width:74px;height:58px;border-radius:50%;border:2px solid #ff3158;background:rgba(70,0,20,.9);color:#fff;font:bold 13px Arial,sans-serif;box-shadow:0 0 16px rgba(255,49,88,.35);touch-action:manipulation";
  fire.addEventListener("pointerdown",e=>{e.preventDefault();shoot();});document.body.appendChild(fire);

  state.enemies=[makeEnemy(0),makeEnemy(1),makeEnemy(2)];seedPickups();renderShop();renderUI();
  function update(delta) {
    const dt=Math.min(Math.max(Number(delta)||0,0),.05);if(noticeTimer>0){noticeTimer-=dt;if(noticeTimer<=0)notice.style.display="none";}
    state.fireCooldown=Math.max(0,state.fireCooldown-dt);updateRaceRewards();collectBullets(dt);
    if(state.gameOver){renderUI();return;}
    state.safe=isSafeZone();const nearest=updateEnemies(dt);renderUI(nearest);
  }
  window.CQEnergyVampires={update,getEnergy:()=>state.energy,getState:()=>({level:state.level,cash:state.cash,ammo:state.ammo,owned:{...state.owned},activeWeapon:state.activeWeapon,kills:{...state.kills}}),shoot};
})();
