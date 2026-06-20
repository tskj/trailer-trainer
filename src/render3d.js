import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 3D renderer for Trailer Trainer.
//
// The sim stays 2D (x, y, theta, phi). We map it onto the ground plane as
// world (x, y_up, z) = (sim.x, height, sim.y), heading = rotation.y = -theta.
//
// Lighting follows the droste recipe (../droste): a three-colored directional
// rig (warm sun + cool sky fill + warm bounce) over a Cook-Torrance PBR
// material (Three's MeshStandardMaterial is exactly that BRDF), a generated
// gradient environment for reflections, soft shadow-mapped penumbra, and a
// hand-written tonemap/grade post pass (exposure -> exponential tonemap ->
// vignette) — tuned brighter and more saturated than droste's moody original
// for a cute, vibrant low-poly look.
// ---------------------------------------------------------------------------

const B = 8000;                       // "infinity" extent for half-plane / quad regions (matches sim)
const WALL_H = 34;                    // raised-region / wall height
const TRAIL_Y = 0.6;                  // trail ribbon height above ground
const DISPLAY_FOV = 52;               // the framing the player sees
const OVERSCAN = 1.12;                // render this much wider so the lens barrel can sample outward

// ---- palette (sRGB hex; vibrant + cute) ----
const COL = {
  carBody:    '#ef5d60',  // coral red
  carBodyDark:'#c2484b',  // fenders / trim / antenna
  carRoof:    '#fbeede',  // cream two-tone roof
  glass:      '#27293d',
  chrome:     '#d6dae6',  // bumpers
  grille:     '#2a2d3a',
  headlight:  '#fff2c2',
  taillight:  '#ff3b3b',
  trailerBed: '#a8845a',  // wood deck
  trailerRail:'#566070',  // steel rails
  tongue:     '#5b6472',
  strap:      '#383d49',  // tie-down straps
  crateA:     '#e8a13b',  // amber crate
  crateB:     '#4ec5b3',  // teal crate
  barrel:     '#3f7fc9',  // blue barrel
  plank:      '#8a6240',  // brown plank
  wheel:      '#23233b',
  hub:        '#cfd4e6',
  cone:      '#ff8c1a',
  coneBand:  '#fff4e0',
  coneHit:   '#7e8590',
  ground:    '#7e8aa1',  // desaturated slate so colors pop
  wall:      '#9aa6bd',
  region:    '#6d7891',
  bay:       '#f2c44d',
  bayGood:   '#56d98a',
};

// ---- light rig (droste: 3 colored lights, none white) ----
const SUN_DIR = new THREE.Vector3(0.55, 1.0, 0.42).normalize(); // warm key, upper-front-right
const SKY_DIR = new THREE.Vector3(0.0, 1.0, 0.0);               // cool fill from straight up
const BNC_DIR = new THREE.Vector3(-0.55, 0.18, -0.42).normalize(); // warm bounce, anti-sun low

export function createScene(canvas, G) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;          // we tonemap ourselves in the post pass
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // render wider than we display, so the lens pass can push the edges out (barrel) without black corners
  const fovWide = 2 * Math.atan(Math.tan(DISPLAY_FOV * Math.PI / 360) * OVERSCAN) * 180 / Math.PI;
  const camera = new THREE.PerspectiveCamera(fovWide, 1, 1, 12000);

  // ---- HDR target + hand-written grade pass ----
  let rt = makeTarget(1, 1);
  const post = makePost();
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.material));

  // ---- environment + sky ----
  const env = buildEnvironment(renderer);
  scene.environment = env;
  scene.add(makeSky());

  // ---- lights ----
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffe0ad'), 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 1.2;
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 1400; sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260;
  scene.add(sun, sun.target);

  const sky = new THREE.DirectionalLight(new THREE.Color('#acccff'), 2.4);    // cool fill
  sky.position.copy(SKY_DIR);
  const bounce = new THREE.DirectionalLight(new THREE.Color('#ffb877'), 1.3);  // warm bounce
  bounce.position.copy(BNC_DIR);
  scene.add(sky, bounce);
  scene.add(new THREE.AmbientLight(new THREE.Color('#aec4e2'), 1.15));

  // ---- ground ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24000, 24000),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.ground), roughness: 0.96, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(makeGrid());

  // ---- persistent rig (car + trailer) ----
  const car = buildCar(G);
  const trailer = buildTrailer(G);
  scene.add(car.group, trailer.group);

  // ---- per-level dynamic content ----
  const dyn = new THREE.Group();
  scene.add(dyn);

  // shared cone materials (swap on hit)
  const coneMat    = new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.cone), roughness: 0.55, metalness: 0.0, flatShading: true });
  const coneHitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.coneHit), roughness: 0.85, metalness: 0.0, flatShading: true });
  const bandMat    = new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.coneBand), roughness: 0.5, emissive: new THREE.Color('#3a2a10'), emissiveIntensity: 0.4 });
  const wallMat    = new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.wall), roughness: 0.9, metalness: 0.0, flatShading: true });
  const regionMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.region), roughness: 0.95, metalness: 0.0, flatShading: true });

  // trails
  const trailObjs = {
    front:   makeTrail('#39c2d7'),
    rear:    makeTrail('#f59f3b'),
    trailer: makeTrail('#e8567c'),
  };
  scene.add(trailObjs.front, trailObjs.rear, trailObjs.trailer);

  // skidmarks: dark quad ribbons stamped where wheels slip (rebuild attribute on change)
  const SKID_MAX = 700, SKID_W = 9, SKID_Y = 0.18;
  const skidGeo = new THREE.BufferGeometry();
  skidGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const skidMesh = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({
    color: new THREE.Color('#16161c'), transparent: true, opacity: 0.5, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
  }));
  skidMesh.frustumCulled = false; skidMesh.renderOrder = 2;
  scene.add(skidMesh);
  let skidVerts = [], skidDirty = false;
  const skidLast = {};
  function emitQuad(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * SKID_W * 0.5, pz = dx / len * SKID_W * 0.5, Y = SKID_Y;
    skidVerts.push(x0+px,Y,z0+pz, x0-px,Y,z0-pz, x1-px,Y,z1-pz,  x0+px,Y,z0+pz, x1-px,Y,z1-pz, x1+px,Y,z1+pz);
    if (skidVerts.length > SKID_MAX * 18) skidVerts.splice(0, skidVerts.length - SKID_MAX * 18);
    skidDirty = true;
  }
  function updateSkids(marks) {
    for (const m of marks) {
      if (m.on) {
        const last = skidLast[m.key];
        if (last) { if ((last[0]-m.x)**2 + (last[1]-m.y)**2 >= 1.5) { emitQuad(last[0], last[1], m.x, m.y); skidLast[m.key] = [m.x, m.y]; } }
        else skidLast[m.key] = [m.x, m.y];
      } else skidLast[m.key] = null;
    }
    if (skidDirty) { const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(skidVerts,3)); const old=skidMesh.geometry; skidMesh.geometry=g; old.dispose(); skidDirty=false; }
  }
  function clearSkids() { skidVerts = []; for (const k in skidLast) skidLast[k] = null; const old=skidMesh.geometry; skidMesh.geometry=new THREE.BufferGeometry(); old.dispose(); }

  let bay = null;   // {group, frame:[mats], pad}

  // ------------------------------------------------------------------ API
  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    rt.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
    post.material.uniforms.uRes.value.set(w * pr, h * pr);
  }

  function buildLevel(level, bayDims) {
    dyn.clear();
    clearSkids();
    bay = null;
    if (level.bay) bay = buildBay(level.bay, bayDims, dyn);
    for (const o of level.obstacles) {
      if (o.t === 'cone') {
        const r = o.r || 10;
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.0, 7), coneMat);
        body.position.y = r; body.castShadow = true; body.receiveShadow = true;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.74, r * 0.42, 7), bandMat);
        band.position.y = r * 0.85; band.castShadow = true;
        const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 0.3, r * 2.1), coneMat);
        base.position.y = r * 0.15; base.castShadow = true; base.receiveShadow = true;
        g.add(body, band, base);
        g.position.set(o.x, 0, o.y);
        dyn.add(g);
        o._m = body; o._mBand = band; o._mBase = base;   // for coneHit swap
      } else if (o.t === 'wall') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.hl * 2, WALL_H, o.hw * 2), wallMat);
        m.position.set(o.x, WALL_H / 2, o.y); m.rotation.y = -o.ang;
        m.castShadow = true; m.receiveShadow = true; dyn.add(m);
      } else if (o.t === 'disc') {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, WALL_H, 28), regionMat);
        m.position.set(o.cx, WALL_H / 2, o.cy); m.castShadow = true; m.receiveShadow = true; dyn.add(m);
      } else if (o.t === 'half' || o.t === 'quad') {
        const pts = regionPolygon(o);
        if (pts) {
          const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));  // -y => world +z
          const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(geo, regionMat);
          m.castShadow = true; m.receiveShadow = true; dyn.add(m);
        }
      }
    }
  }

  function coneHit(o) {
    if (o._m) o._m.material = coneHitMat;
    if (o._mBase) o._mBase.material = coneHitMat;
  }

  function update(pose, view) {
    // --- rig transforms ---
    const c = Math.cos(pose.theta), s = Math.sin(pose.theta);
    car.group.position.set(pose.x, 0, pose.y);
    car.group.rotation.y = -pose.theta;
    car.steer(pose.delta);
    const hx = pose.x - G.hitchC * c, hy = pose.y - G.hitchC * s;
    trailer.group.position.set(hx, 0, hy);
    trailer.group.rotation.y = -pose.phi;

    // --- camera ---
    if (view.rotateFollow) {
      const thS = -Math.PI / 2 - view.camRot;        // recover smoothed heading from camRot
      const fx = Math.cos(thS), fz = Math.sin(thS);
      camera.position.set(view.camX - fx * 120, 440, view.camY - fz * 120);   // higher + closer = steeper look-down
      camera.up.set(0, 1, 0);
      camera.lookAt(view.camX + fx * 8, 4, view.camY + fz * 8);                // centre near the rig -> more of behind in view
    } else {
      camera.position.set(view.camX, 620, view.camY + 0.001);
      camera.up.set(0, 0, -1);
      camera.lookAt(view.camX, 0, view.camY);
    }

    // --- sun follows the rig so shadows stay crisp ---
    sun.target.position.set(pose.x, 0, pose.y);
    sun.position.set(pose.x + SUN_DIR.x * 500, SUN_DIR.y * 500, pose.y + SUN_DIR.z * 500);

    // --- bay color ---
    if (bay) {
      const col = view.bayActive ? COL.bayGood : COL.bay;
      bay.pad.material.color.set(col);
      bay.pad.material.emissive.set(col);
      for (const fm of bay.frame) { fm.color.set(col); fm.emissive.set(col); }
    }

    // --- trails ---
    for (const k of ['front', 'rear', 'trailer']) {
      const arr = view.trails[k], obj = trailObjs[k];
      obj.visible = view.trailsOn && arr.length > 1;
      if (obj.visible) {
        obj.geometry.setFromPoints(arr.map(p => new THREE.Vector3(p[0], TRAIL_Y, p[1])));
      }
    }

    // --- render: scene -> HDR target -> grade pass -> screen ---
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    post.material.uniforms.uScene.value = rt.texture;
    renderer.render(quadScene, quadCam);
  }

  function project(x, y) {
    const v = new THREE.Vector3(x, 8, y).project(camera);
    v.x *= OVERSCAN; v.y *= OVERSCAN;             // wide render is cropped back to the display FOV
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, behind: v.z >= 1 };
  }

  resize();
  return { renderer, scene, camera, resize, buildLevel, coneHit, update, project, updateSkids, clearSkids, skidCountDbg: () => skidVerts.length/18 };
}

// =========================================================================
// builders
// =========================================================================
function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.r ?? 0.55, metalness: o.m ?? 0.0, flatShading: o.flat ?? true, ...(o.extra || {}) });
}
function emat(color, intensity = 0.9) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4, metalness: 0 });
}
// box whose BOTTOM rests at y (so cargo sits on the deck)
function boxMesh(material, sx, sy, sz, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  m.position.set(x, y + sy / 2, z); m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildCar(G) {
  // Low-poly Beetle/Mini bubble-car. The whole shape is rounded — a faceted body
  // shell (one continuous hood->roof->tail bulge), a dark glassy cabin dome and a
  // small cream roof cap blended into it, round headlight "eyes", little fender
  // bulges over fat wheels. No box-with-a-thing-on-top, so no "pill".
  const group = new THREE.Group();
  const bodyMat  = mat(COL.carBody, { r: 0.45, m: 0.12 });
  const roofMat  = mat(COL.carRoof, { r: 0.5, m: 0.05 });
  const glassMat = mat(COL.glass, { r: 0.06, m: 0.6 });
  const wheelMat = mat(COL.wheel, { r: 0.78, flat: false });
  const hubMat   = mat(COL.hub, { r: 0.4, m: 0.5, flat: false });
  const chromeMat= mat(COL.chrome, { r: 0.3, m: 0.75 });
  const headMat  = emat(COL.headlight, 1.2);
  const tailMat  = emat(COL.taillight, 0.95);

  const len = 2 * G.CAR_HL, wid = G.carW, wheelR = G.wheelL / 2 + 1.5, yb = wheelR;
  const frontX = G.CAR_CTR + G.CAR_HL, rearX = G.CAR_CTR - G.CAR_HL, cx = G.CAR_CTR;

  // faceted scaled-sphere helper (rx,ry,rz are radii)
  const dome = (mtl, rx, ry, rz, x, y, z = 0, wseg = 14, hseg = 10) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, wseg, hseg), mtl);
    m.scale.set(rx, ry, rz); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  };

  // rounded body shell — one continuous bulge spanning the footprint
  dome(bodyMat, len * 0.52, 12, wid * 0.52, cx, yb + 4.5);
  // dark window band, then a cream roof dome sitting on top of it (two-tone greenhouse)
  dome(glassMat, len * 0.31, 7.5, wid * 0.45, cx - len * 0.05, yb + 10);
  dome(roofMat, len * 0.27, 6.5, wid * 0.40, cx - len * 0.07, yb + 14);

  // round headlight "eyes" + taillights (slightly squashed discs facing out)
  const lamp = new THREE.SphereGeometry(2.9, 10, 8);
  for (const z of [-wid * 0.30, wid * 0.30]) {
    const hl = new THREE.Mesh(lamp, headMat); hl.scale.set(0.6, 1, 1); hl.position.set(frontX - 2.5, yb + 6, z); group.add(hl);
    const tl = new THREE.Mesh(lamp, tailMat); tl.scale.set(0.6, 0.9, 1); tl.position.set(rearX + 2.5, yb + 6.5, z); group.add(tl);
  }
  // chrome bumpers
  const fB = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, wid * 0.86), chromeMat);
  fB.position.set(frontX - 2, yb + 2.6, 0); fB.castShadow = true; group.add(fB);
  const rB = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, wid * 0.86), chromeMat);
  rB.position.set(rearX + 2, yb + 2.6, 0); rB.castShadow = true; group.add(rB);

  // chunky wheels at the axles (front pair steers) + little fender bulges
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, G.wheelW + 4, 14);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.4, wheelR * 0.4, G.wheelW + 4.4, 8);
  const frontWheels = [];
  const mkWheel = (x, z, steer) => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, wheelMat); tire.rotation.x = Math.PI / 2; tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat); hub.rotation.x = Math.PI / 2;
    w.add(tire, hub); w.position.set(x, wheelR, z); group.add(w);
    if (steer) frontWheels.push(w);
    dome(bodyMat, wheelR * 1.35, wheelR * 1.0, (G.wheelW + 5) / 2, x, wheelR + 1.5, z > 0 ? wid * 0.42 : -wid * 0.42, 10, 6);
  };
  mkWheel(0, -G.carTrack / 2, false); mkWheel(0, G.carTrack / 2, false);
  mkWheel(G.L, -G.carTrack / 2, true); mkWheel(G.L, G.carTrack / 2, true);

  return { group, steer: (d) => { for (const w of frontWheels) w.rotation.y = -d; } };
}

function buildTrailer(G) {
  const group = new THREE.Group();
  const bedMat    = mat(COL.trailerBed, { r: 0.8, m: 0.0 });
  const railMat   = mat(COL.trailerRail, { r: 0.6, m: 0.25 });
  const tongueMat = mat(COL.tongue, { r: 0.6, m: 0.3, flat: false });
  const wheelMat  = mat(COL.wheel, { r: 0.75, flat: false });
  const strapMat  = mat(COL.strap, { r: 0.85, m: 0.0 });
  const tailMat   = emat(COL.taillight, 0.7);

  const len = 2 * G.TR_HL, wid = G.trailerW, wheelR = G.wheelL / 2 + 1;
  const ctr = -G.TR_CTR;
  const deckH = 4, deckY = wheelR + 1;                  // flat deck sits just above the wheels
  const topY = deckY + deckH / 2;                       // cargo surface

  // flat open deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, deckH, wid), bedMat);
  deck.position.set(ctr, deckY, 0); deck.castShadow = deck.receiveShadow = true;
  group.add(deck);

  // low side + front rails (open at the back, like a utility trailer)
  const railH = 5, railT = 2;
  for (const z of [-wid / 2 + railT / 2, wid / 2 - railT / 2]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, railH, railT), railMat);
    r.position.set(ctr, topY + railH / 2, z); r.castShadow = true; group.add(r);
  }
  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(railT, railH + 3, wid), railMat);
  frontRail.position.set(ctr - len / 2 + railT / 2, topY + (railH + 3) / 2, 0);
  frontRail.castShadow = true; group.add(frontRail);

  // A-frame tongue from the deck to the hitch (x=0)
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(G.boxFront, 3.5, 4), tongueMat);
  tongue.position.set(-G.boxFront / 2, deckY - 1, 0); tongue.castShadow = true; group.add(tongue);

  // ---- cargo: mismatched junk strapped to the deck ----
  group.add(boxMesh(mat(COL.crateA, { flat: true }), 22, 17, 20, ctr - 7, topY, -2, 0.12));      // big amber crate
  group.add(boxMesh(mat(COL.crateB, { flat: true }), 13, 11, 13, ctr - 11, topY + 17, 5, -0.2));  // small teal crate stacked on top
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 17, 10), mat(COL.barrel, { flat: true }));
  barrel.position.set(ctr + 13, topY + 8.5, 6); barrel.castShadow = barrel.receiveShadow = true; group.add(barrel);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(42, 2.5, 7), mat(COL.plank, { flat: true }));
  plank.position.set(ctr + 2, topY + 11, -9); plank.rotation.z = 0.14; plank.rotation.y = 0.12;
  plank.castShadow = true; group.add(plank);

  // tie-down straps over the load
  for (const x of [ctr - 8, ctr + 9]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.4, 24, wid + 2), strapMat);
    s.position.set(x, topY + 9, 0); group.add(s);
  }

  // rear reflectors on the deck corners
  for (const z of [-wid * 0.34, wid * 0.34]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 5), tailMat);
    tl.position.set(-G.boxBack + 1, topY + 2, z); group.add(tl);
  }

  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, G.wheelW + 3, 12);
  for (const z of [-G.trailerTrack / 2, G.trailerTrack / 2]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.x = Math.PI / 2;
    w.position.set(-G.draw_d, wheelR, z); w.castShadow = true; group.add(w);
  }
  return { group };
}

function buildBay(b, dims, parent) {
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.y); group.rotation.y = -b.ang;
  const hl = dims.hl, hw = dims.hw;
  const padMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(COL.bay), emissive: new THREE.Color(COL.bay), emissiveIntensity: 0.35,
    transparent: true, opacity: 0.22, roughness: 1, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,   // beat ground z-fighting
  });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(hl * 2, hw * 2), padMat);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.25; pad.receiveShadow = false;
  group.add(pad);

  // border frame: 4 thin emissive bars
  const frame = [];
  const t = 2.2, yb = 0.8;
  const bars = [
    [0, -hw, hl * 2, t], [0, hw, hl * 2, t],     // top/bottom (along local x)
    [-hl, 0, t, hw * 2], [hl, 0, t, hw * 2],      // left/right (along local z)
  ];
  for (const [cx, cz, sx, sz] of bars) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.bay), emissive: new THREE.Color(COL.bay), emissiveIntensity: 0.8, roughness: 0.7, metalness: 0 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.4, sz), m);
    bar.position.set(cx, yb, cz);
    group.add(bar); frame.push(m);
  }
  parent.add(group);
  return { group, frame, pad };
}

// =========================================================================
// region polygons (replicate the SVG keep-out shapes)
// =========================================================================
function regionPolygon(o) {
  if (o.t === 'half') {
    const a = o.at;
    if (o.axis === 'y') return o.sign > 0
      ? [[-B, a], [B, a], [B, a + 2 * B], [-B, a + 2 * B]]
      : [[-B, a - 2 * B], [B, a - 2 * B], [B, a], [-B, a]];
    return o.sign > 0
      ? [[a, -B], [a + 2 * B, -B], [a + 2 * B, B], [a, B]]
      : [[a - 2 * B, -B], [a, -B], [a, B], [a - 2 * B, B]];
  }
  if (o.t === 'quad') {
    const r = o.r, sgn = o.flipx ? -1 : 1;
    const arc = [];
    const N = o.n ? Math.max(40, Math.round(r / 7.5)) : 24;
    for (let i = 1; i <= N; i++) {
      const th = Math.PI + (Math.PI / 2) * (i / N), ct = Math.cos(th), stt = Math.sin(th);
      const px = o.n ? o.ccx + r * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / o.n) : o.ccx + r * ct;
      const py = o.n ? o.ccy + r * Math.sign(stt) * Math.pow(Math.abs(stt), 2 / o.n) : o.ccy + r * stt;
      arc.push([px, py]);
    }
    let poly;
    if (o.mode === 'in') {
      poly = [[o.ex, B], [o.ex, o.ccy], ...arc, [B, o.ey], [B, B]];
    } else {
      poly = [[-B, -B], [-B, B], [o.ex, B], [o.ex, o.ccy], ...arc, [B, o.ey], [B, -B]];
    }
    return poly.map(([x, y]) => [sgn * x, y]);
  }
  return null;
}

// =========================================================================
// environment, sky, grid, trail, target, post
// =========================================================================
function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.add(makeSky());
  const tex = pmrem.fromScene(s, 0, 0.1, 1000).texture;
  pmrem.dispose();
  return tex;
}

function makeSky() {
  const geo = new THREE.SphereGeometry(8000, 24, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#5fb8f0') },
      mid: { value: new THREE.Color('#bfe6ff') },
      bot: { value: new THREE.Color('#8a93a8') },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform vec3 top, mid, bot;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, m);
}

function makeGrid() {
  const grid = new THREE.GridHelper(24000, 400, new THREE.Color('#46505f'), new THREE.Color('#46505f'));
  grid.position.y = 0.02;
  grid.material.transparent = true; grid.material.opacity = 0.35;
  return grid;
}

function makeTrail(color) {
  const geo = new THREE.BufferGeometry();
  const m = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
  const line = new THREE.Line(geo, m); line.frustumCulled = false; line.visible = false;
  return line;
}

function makeTarget(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    colorSpace: THREE.NoColorSpace, depthBuffer: true,
  });
}

// hand-written tonemap + grade (the droste "tail"): lens warp -> exposure ->
// exponential tonemap -> subtle vignette. Outputs linear; Three -> sRGB on screen.
function makePost() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScene: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uExposure: { value: 1.7 },
      uLens: { value: 0.06 },             // droste used 0.05; 0 = off. radial barrel strength
      uOverscan: { value: OVERSCAN },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv; uniform sampler2D uScene; uniform vec2 uRes;
      uniform float uExposure; uniform float uLens; uniform float uOverscan;
      void main(){
        // droste lens: radial  lens = uLens * |uv|^2 * uv  (aspect-correct, square units,
        // long axis spanning [-1,1]). Crop the overscanned render back, then sample OUTWARD
        // so the edges show a touch more scene -> the photographic barrel droste had.
        float aspect = uRes.x / uRes.y;
        vec2 p   = vUv * 2.0 - 1.0;                 // [-1,1] both axes
        vec2 uv  = vec2(p.x, p.y / aspect);         // square units
        vec2 lens = uLens * dot(uv, uv) * uv;
        vec2 uvd = uv / uOverscan + lens;
        vec2 sp  = vec2(uvd.x, uvd.y * aspect);     // undo aspect
        vec2 suv = clamp(sp * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = texture2D(uScene, suv).rgb;
        // exponential tonemap (droste): 1 - exp(-exposure * c) + tiny linear toe
        c = vec3(1.0) - exp(-uExposure * c) + 0.012 * c;
        // gentle vignette (on undistorted screen position)
        vec2 d = vUv - 0.5;
        float vig = smoothstep(0.95, 0.32, dot(d, d) * 2.0);
        c *= mix(0.9, 1.0, vig);
        gl_FragColor = vec4(c, 1.0);   // linear; renderer applies sRGB
      }`,
  });
  return { material };
}
