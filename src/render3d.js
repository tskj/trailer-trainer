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
const MSAA = 4;                       // scene-target multisample count (AA at ~1/4 the cost of the old 2x2 supersample)

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
  ground:    '#d6d1c5',  // bright, near-neutral warm concrete tarmac in the sun
  wall:      '#9aa6bd',
  region:    '#6d7891',
  bay:       '#f2c44d',
  bayGood:   '#56d98a',
};

// ---- light rig (droste: 3 colored lights, none white) ----
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const _hitch = new THREE.Vector3();                             // reused scratch for the hitch world point

// droste-style shadow falloff: per-channel gamma on the sun's shadow mask, so the soft
// penumbra trails warm (blue/green darken faster than red). exponents > 1 = darker channel.
const PENUMBRA = new THREE.Vector3(1.0, 1.75, 2.9);
// the exact dir-light shadow line in three's lights_fragment_begin (pinned three@0.184);
// we splice the scalar shadow into a per-channel pow() right after it.
const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
// patch a MeshStandardMaterial so its sun shadow uses the warm per-channel falloff.
// onBeforeCompile runs before #include resolution, so we expand the chunk from the live
// ShaderChunk (its text always matches the installed three), splice in the pow(), and
// inline it in place of the directive. A version mismatch just no-ops (no crash).
function withPenumbra(material) {
  const patched = THREE.ShaderChunk.lights_fragment_begin.replace(
    SHADOW_LINE,
    'float _shFac = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\tdirectLight.color *= pow( vec3( _shFac ), uPenumbra );');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPenumbra = { value: PENUMBRA };
    shader.fragmentShader = 'uniform vec3 uPenumbra;\n' +
      shader.fragmentShader.replace('#include <lights_fragment_begin>', patched);
  };
  return material;
}
const SUN_DIR = new THREE.Vector3(0.55, 1.0, 0.42).normalize(); // warm key, upper-front-right
const SKY_DIR = new THREE.Vector3(0.0, 1.0, 0.0);               // cool fill from straight up
const BNC_DIR = new THREE.Vector3(-0.55, 0.18, -0.42).normalize(); // warm bounce, anti-sun low

export function createScene(canvas, G) {
  // antialias:false — the default framebuffer only ever receives the post quad; scene AA is MSAA on the HDR target
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // soft penumbra -> room for the warm colour trail
  renderer.toneMapping = THREE.NoToneMapping;          // we tonemap ourselves in the post pass
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // render wider than we display, so the lens pass can push the edges out (barrel) without black corners
  const fovWide = 2 * Math.atan(Math.tan(DISPLAY_FOV * Math.PI / 360) * OVERSCAN) * 180 / Math.PI;
  const camera = new THREE.PerspectiveCamera(fovWide, 1, 1, 12000);

  // aspect-driven camera dolly: on narrow/portrait screens the camera pulls back so the
  // rig stays framed like it is on desktop instead of collapsing to a tall, cramped strip.
  // 1 on landscape (desktop unchanged); grows gently as the screen gets taller than wide.
  let viewScale = 1;

  // ---- HDR target (multisampled), bloom buffers, hand-written grade pass ----
  let rt = makeTarget(1, 1, { samples: MSAA });       // scene; MSAA resolves when the texture is sampled
  let brightRT = makeTarget(1, 1, { depth: false });  // bloom: extracted highlights
  let blurA = makeTarget(1, 1, { depth: false });
  let blurB = makeTarget(1, 1, { depth: false });
  const post = makePost(), bright = makeBright(), blur = makeBlur();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.material);
  const quadScene = new THREE.Scene(); quadScene.add(quadMesh);
  const drawQuad = (mat, target) => { quadMesh.material = mat; renderer.setRenderTarget(target || null); renderer.render(quadScene, quadCam); };

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
  sun.shadow.radius = 4;          // PCF penumbra width — enough for the droste warm-trail falloff, but crisper
  sun.shadow.blurSamples = 16;
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
    withPenumbra(new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.ground), roughness: 0.96, metalness: 0.0 }))
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

  // shared cone materials
  const coneMat    = withPenumbra(new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.cone), roughness: 0.55, metalness: 0.0, flatShading: true }));
  const bandMat    = withPenumbra(new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.coneBand), roughness: 0.5, emissive: new THREE.Color('#3a2a10'), emissiveIntensity: 0.4 }));
  // out-of-bounds keep-out zones are painted as a flat diagonal hatch on the tarmac
  // (no 3D walls). Computed in a fragment shader from WORLD x/z, so — like the SVG
  // <pattern patternUnits="userSpaceOnUse"> in the original PoC — it's ONE continuous
  // global hatch with no tiling seams / per-tile staggering, fwidth-antialiased so it
  // stays crisp at any zoom.
  const hatchMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3,
    extensions: { derivatives: true },
    uniforms: {
      uPeriod: { value: 11.3 },                                            // world units per diagonal stripe cycle (~8u perpendicular, like the PoC)
      uDuty:   { value: 0.5 },                                             // half line / half gap (the 4-of-8 SVG line)
      uFill:   { value: new THREE.Color('#6c604a') }, uFillA: { value: 0.22 },
      uLine:   { value: new THREE.Color('#3c3224') }, uLineA: { value: 0.5 },
    },
    vertexShader: `
      varying vec2 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec2 vW;
      uniform float uPeriod, uDuty, uFillA, uLineA;
      uniform vec3 uFill, uLine;
      void main(){
        float d  = (vW.x + vW.y) / uPeriod;    // diagonal coordinate (vW.y is world z)
        float f  = fract(d);
        float aa = fwidth(d);                  // d is continuous -> no glitch at the wrap
        float m  = 1.0 - smoothstep(uDuty*0.5 - aa, uDuty*0.5 + aa, abs(f - 0.5));
        gl_FragColor = vec4(mix(uFill, uLine, m), mix(uFillA, uLineA, m));
      }`,
  });
  // crisp boundary line around each keep-out region (like the SVG stroke in the PoC)
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#3a3020') });

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

  let bay = null;   // { group, fillMat, border }
  const WHITE = new THREE.Color(1, 1, 1);

  // ------------------------------------------------------------------ API
  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // landscape (w>=h): no change. portrait: dolly out by (h/w)^0.4, capped, for a balanced
    // framing — gives back horizontal context without shrinking the rig to a dot.
    viewScale = w >= h ? 1 : clamp(Math.pow(h / w, 0.4), 1, 1.5);
    const pr = renderer.getPixelRatio();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    rt.setSize(W, H);
    post.material.uniforms.uRes.value.set(W, H);
    const bw = Math.max(1, Math.floor(w * pr / 2)), bh = Math.max(1, Math.floor(h * pr / 2));   // bloom at half res — it's all blur anyway
    brightRT.setSize(bw, bh); blurA.setSize(bw, bh); blurB.setSize(bw, bh);
    blur.texel.set(1 / bw, 1 / bh);
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
        // squircle base slab (extrude the superellipse, then lay it flat so it rises in +Y)
        const baseGeo = new THREE.ExtrudeGeometry(superellipseShape(r * 1.05, 4, 32), { depth: r * 0.3, bevelEnabled: false });
        baseGeo.rotateX(-Math.PI / 2);
        const base = new THREE.Mesh(baseGeo, coneMat);
        base.castShadow = true; base.receiveShadow = true;
        g.add(body, band, base);
        g.position.set(o.x, 0, o.y);
        dyn.add(g);
      } else if (o.t === 'wall' || o.t === 'disc' || o.t === 'half' || o.t === 'quad') {
        // every keep-out shape -> a flat hatched polygon lying on the tarmac
        let pts = null;
        if (o.t === 'wall') {
          const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
          const cn = (lx, lz) => [o.x + lx * ca - lz * sa, o.y + lx * sa + lz * ca];
          pts = [cn(-o.hl, -o.hw), cn(o.hl, -o.hw), cn(o.hl, o.hw), cn(-o.hl, o.hw)];
        } else if (o.t === 'disc') {
          pts = [];
          const N = 48;
          for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push([o.cx + o.r * Math.cos(a), o.cy + o.r * Math.sin(a)]); }
        } else {
          pts = regionPolygon(o);
        }
        if (pts) {
          const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));  // -y => world +z
          const geo = new THREE.ShapeGeometry(shape);
          geo.rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(geo, hatchMat);
          m.position.y = 0.16;             // just above ground/grid, below the bay pad (0.25)
          m.receiveShadow = true; dyn.add(m);
          // outline the region edge so the hatch reads as a clearly bordered zone
          const edge = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], 0.2, p[1]))),
            edgeMat);
          dyn.add(edge);
        }
      }
    }
  }

  function update(pose, view) {
    // --- rig transforms ---
    car.group.position.set(pose.x, 0, pose.y);
    car.group.rotation.y = -pose.theta;
    car.steer(pose.delta);
    // body attitude (cosmetic): pitch about the lateral axis (z), roll about the forward axis (x)
    car.tilt.rotation.set(pose.roll || 0, 0, pose.pitch || 0);

    // single shared coupling point: the hitch as carried by the car's (tilted) sprung body.
    // getWorldPosition refreshes the car's world matrices, so this already includes pitch/roll.
    const H = car.hitchAnchor.getWorldPosition(_hitch);
    // trailer hangs off H: place its tongue tip exactly there, then derive a pitch that puts
    // its axle back on the ground. Tongue tip stays glued to the car; wheels stay planted.
    const ty = G.wheelL / 2 + 1;
    trailer.group.position.set(H.x, H.y - ty, H.z);
    trailer.group.rotation.y = -pose.phi;
    const trPitch = Math.asin(clamp((H.y - ty) / G.draw_d, -0.5, 0.5));
    trailer.tilt.rotation.set(pose.trRoll || 0, 0, trPitch);

    // --- camera ---
    if (view.rotateFollow) {
      const thS = -Math.PI / 2 - view.camRot;        // recover smoothed heading from camRot
      const fx = Math.cos(thS), fz = Math.sin(thS);
      // scaling back-offset + height together preserves the look-down pitch; it just dollies out
      camera.position.set(view.camX - fx * 120 * viewScale, 440 * viewScale, view.camY - fz * 120 * viewScale);
      camera.up.set(0, 1, 0);
      // driving forward (look 0..1) pushes the aim ahead + raises it -> camera tilts up toward where you're going
      const look = view.camLook || 0;
      camera.lookAt(view.camX + fx * (8 + 200 * look), 4 + 105 * look, view.camY + fz * (8 + 200 * look));
    } else {
      camera.position.set(view.camX, 620 * viewScale, view.camY + 0.001);
      camera.up.set(0, 0, -1);
      camera.lookAt(view.camX, 0, view.camY);
    }

    // --- sun follows the rig so shadows stay crisp ---
    sun.target.position.set(pose.x, 0, pose.y);
    sun.position.set(pose.x + SUN_DIR.x * 500, SUN_DIR.y * 500, pose.y + SUN_DIR.z * 500);

    // --- bay glow: colour (OKLab-interpolated yellow->green) is computed in the loop ---
    if (bay && view.bayColor) {
      bay.fillMat.uniforms.uColor.value.set(view.bayColor);
      bay.border.material.color.set(view.bayEdge || view.bayColor).lerp(WHITE, 0.28).multiplyScalar(3.6);  // warm-hot core (less white) so the dashes keep their amber; bloom carries the glow
    }

    // --- trails ---
    for (const k of ['front', 'rear', 'trailer']) {
      const arr = view.trails[k], obj = trailObjs[k];
      obj.visible = view.trailsOn && arr.length > 1;
      if (obj.visible) {
        obj.geometry.setFromPoints(arr.map(p => new THREE.Vector3(p[0], TRAIL_Y, p[1])));
      }
    }

    // --- render: scene -> HDR (MSAA) -> bloom -> grade -> screen ---
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    // bloom: extract highlights, then two widening separable-gaussian iterations
    bright.material.uniforms.uScene.value = rt.texture;
    drawQuad(bright.material, brightRT);
    let bsrc = brightRT;
    for (let i = 0; i < 2; i++) {
      blur.material.uniforms.uTex.value = bsrc.texture;
      blur.material.uniforms.uDir.value.set(blur.texel.x * (i + 1), 0);
      drawQuad(blur.material, blurA);
      blur.material.uniforms.uTex.value = blurA.texture;
      blur.material.uniforms.uDir.value.set(0, blur.texel.y * (i + 1));
      drawQuad(blur.material, blurB);
      bsrc = blurB;
    }
    // composite to screen
    post.material.uniforms.uScene.value = rt.texture;
    post.material.uniforms.uBloom.value = blurB.texture;
    drawQuad(post.material, null);
  }

  function project(x, y) {
    const v = new THREE.Vector3(x, 8, y).project(camera);
    v.x *= OVERSCAN; v.y *= OVERSCAN;             // wide render is cropped back to the display FOV
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, behind: v.z >= 1 };
  }
  // robust aim toward a world ground point (x,y): whether it's comfortably on-screen,
  // plus a screen-space direction (y-down) taken from camera/view space so it stays
  // correct even when the point is behind the camera (no projection sign-flip glitches).
  function aim(x, y) {
    const t = new THREE.Vector3(x, 8, y);
    const vp = t.clone().applyMatrix4(camera.matrixWorldInverse);   // camera space: looks down -Z
    const ndc = t.project(camera);
    const inFront = vp.z < 0;
    const onscreen = inFront && Math.abs(ndc.x * OVERSCAN) < 0.94 && Math.abs(ndc.y * OVERSCAN) < 0.94;
    return { onscreen, dirx: vp.x, diry: -vp.y };
  }

  resize();
  // debug: world positions of the two ends of the coupling (should coincide every frame)
  function hitchDbg() {
    const a = car.hitchAnchor.getWorldPosition(new THREE.Vector3());
    const b = trailer.tilt.getWorldPosition(new THREE.Vector3());   // trailer's pivot = its tongue tip
    return { car: [a.x, a.y, a.z], tongue: [b.x, b.y, b.z], gap: a.distanceTo(b) };
  }
  return { renderer, scene, camera, resize, buildLevel, update, project, aim, updateSkids, clearSkids, hitchDbg, skidCountDbg: () => skidVerts.length/18 };
}

// =========================================================================
// builders
// =========================================================================
// superellipse (squircle) outline as a THREE.Shape — higher ex = closer to a rectangle.
function superellipseShape(half, ex = 4, segs = 32) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const t = i / segs * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    pts.push(new THREE.Vector2(
      half * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / ex),
      half * Math.sign(st) * Math.pow(Math.abs(st), 2 / ex)));
  }
  return new THREE.Shape(pts);
}

function mat(color, o = {}) {
  return withPenumbra(new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.r ?? 0.55, metalness: o.m ?? 0.0, flatShading: o.flat ?? true, ...(o.extra || {}) }));
}
function emat(color, intensity = 0.9) {
  return withPenumbra(new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4, metalness: 0 }));
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
  // sprung mass: everything but the wheels lives in `tilt`, which pitches/rolls about the
  // car's centre (at ~CoG height) while the wheels stay planted on the tarmac. `inner`
  // cancels the pivot offset so meshes keep their natural body-frame coordinates.
  const tilt = new THREE.Group(), inner = new THREE.Group();
  tilt.add(inner); group.add(tilt);
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

  // pitch/roll pivot: car centre, a little above the axles (a plausible roll centre)
  const pvY = yb + 5;
  tilt.position.set(cx, pvY, 0); inner.position.set(-cx, -pvY, 0);

  // hitch coupling anchor: bolted to the sprung body (so it rides the car's pitch/roll),
  // at the tow point hitchC behind the rear axle and at the trailer's tongue height. The
  // trailer hangs off this exact world point, so the joint never separates. (couplingY
  // matches the trailer's tongue height = its wheel radius.)
  const couplingY = G.wheelL / 2 + 1;
  const hitchAnchor = new THREE.Object3D();
  hitchAnchor.position.set(-G.hitchC, couplingY, 0);
  inner.add(hitchAnchor);

  // faceted scaled-sphere helper (rx,ry,rz are radii)
  const dome = (mtl, rx, ry, rz, x, y, z = 0, wseg = 14, hseg = 10) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, wseg, hseg), mtl);
    m.scale.set(rx, ry, rz); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; inner.add(m); return m;
  };

  // rounded body shell — one continuous bulge spanning the footprint
  dome(bodyMat, len * 0.52, 12, wid * 0.52, cx, yb + 4.5);
  // dark window band, then a cream roof dome sitting on top of it (two-tone greenhouse)
  dome(glassMat, len * 0.31, 7.5, wid * 0.45, cx - len * 0.05, yb + 10);
  dome(roofMat, len * 0.27, 6.5, wid * 0.40, cx - len * 0.07, yb + 14);

  // round headlight "eyes" + taillights (slightly squashed discs facing out)
  const lamp = new THREE.SphereGeometry(2.9, 10, 8);
  for (const z of [-wid * 0.30, wid * 0.30]) {
    const hl = new THREE.Mesh(lamp, headMat); hl.scale.set(0.6, 1, 1); hl.position.set(frontX - 2.5, yb + 6, z); inner.add(hl);
    const tl = new THREE.Mesh(lamp, tailMat); tl.scale.set(0.6, 0.9, 1); tl.position.set(rearX + 2.5, yb + 6.5, z); inner.add(tl);
  }
  // chrome bumpers
  const fB = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, wid * 0.86), chromeMat);
  fB.position.set(frontX - 2, yb + 2.6, 0); fB.castShadow = true; inner.add(fB);
  const rB = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, wid * 0.86), chromeMat);
  rB.position.set(rearX + 2, yb + 2.6, 0); rB.castShadow = true; inner.add(rB);

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

  return { group, tilt, hitchAnchor, steer: (d) => { for (const w of frontWheels) w.rotation.y = -d; } };
}

function buildTrailer(G) {
  const group = new THREE.Group();
  // the rigid trailer pitches/rolls about its TONGUE TIP (the hitch coupling point), so the
  // tongue never leaves the car's hitch. Pitch is derived in update() to keep the axle on the
  // ground; roll is the trailer's own sprung lean (the ball joint allows it). couplingY is the
  // tongue height — the trailer wheel radius — matching the car's hitch anchor height.
  const couplingY = G.wheelL / 2 + 1;
  const tilt = new THREE.Group(), inner = new THREE.Group();
  tilt.add(inner); group.add(tilt);
  tilt.position.set(0, couplingY, 0); inner.position.set(0, -couplingY, 0);
  const bedMat    = mat(COL.trailerBed, { r: 0.8, m: 0.0 });
  const railMat   = mat(COL.trailerRail, { r: 0.6, m: 0.25 });
  const tongueMat = mat(COL.tongue, { r: 0.6, m: 0.3, flat: false });
  const wheelMat  = mat(COL.wheel, { r: 0.75, flat: false });
  const strapMat  = mat(COL.strap, { r: 0.85, m: 0.0 });
  const tailMat   = emat(COL.taillight, 2.2);   // HDR-bright so the bloom pass glows the tail lights

  const len = 2 * G.TR_HL, wid = G.trailerW, wheelR = G.wheelL / 2 + 1;
  const ctr = -G.TR_CTR;
  const deckH = 4, deckY = wheelR + 1;                  // flat deck sits just above the wheels
  const topY = deckY + deckH / 2;                       // cargo surface

  // flat open deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, deckH, wid), bedMat);
  deck.position.set(ctr, deckY, 0); deck.castShadow = deck.receiveShadow = true;
  inner.add(deck);

  // low side + front rails (open at the back, like a utility trailer)
  const railH = 5, railT = 2;
  for (const z of [-wid / 2 + railT / 2, wid / 2 - railT / 2]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, railH, railT), railMat);
    r.position.set(ctr, topY + railH / 2, z); r.castShadow = true; inner.add(r);
  }
  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(railT, railH + 3, wid), railMat);
  frontRail.position.set(ctr - len / 2 + railT / 2, topY + (railH + 3) / 2, 0);
  frontRail.castShadow = true; inner.add(frontRail);

  // A-frame tongue from the deck to the hitch (x=0)
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(G.boxFront, 3.5, 4), tongueMat);
  tongue.position.set(-G.boxFront / 2, deckY - 1, 0); tongue.castShadow = true; inner.add(tongue);

  // ---- cargo: mismatched junk strapped to the deck ----
  inner.add(boxMesh(mat(COL.crateA, { flat: true }), 22, 17, 20, ctr - 7, topY, -2, 0.12));      // big amber crate
  inner.add(boxMesh(mat(COL.crateB, { flat: true }), 13, 11, 13, ctr - 11, topY + 17, 5, -0.2));  // small teal crate stacked on top
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 17, 10), mat(COL.barrel, { flat: true }));
  barrel.position.set(ctr + 13, topY + 8.5, 6); barrel.castShadow = barrel.receiveShadow = true; inner.add(barrel);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(42, 2.5, 7), mat(COL.plank, { flat: true }));
  plank.position.set(ctr + 2, topY + 11, -9); plank.rotation.z = 0.14; plank.rotation.y = 0.12;
  plank.castShadow = true; inner.add(plank);

  // tie-down straps over the load
  for (const x of [ctr - 8, ctr + 9]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.4, 24, wid + 2), strapMat);
    s.position.set(x, topY + 9, 0); inner.add(s);
  }

  // rear reflectors on the deck corners
  for (const z of [-wid * 0.34, wid * 0.34]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 5), tailMat);
    tl.position.set(-G.boxBack + 1, topY + 2, z); inner.add(tl);
  }

  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, G.wheelW + 3, 12);
  for (const z of [-G.trailerTrack / 2, G.trailerTrack / 2]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.x = Math.PI / 2;
    w.position.set(-G.draw_d, wheelR, z); w.castShadow = true; inner.add(w);
  }
  return { group, tilt };
}

function buildBay(b, dims, parent) {
  const group = new THREE.Group();
  group.position.set(b.x, 0, b.y); group.rotation.y = -b.ang;
  const hl = dims.hl, hw = dims.hw;

  // superellipse outline — higher exponent = smaller corner radius (closer to a rectangle)
  const N = 160, ex = 6;
  const sp = [];
  for (let i = 0; i < N; i++) {
    const t = i / N * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    sp.push([hl * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / ex),
             hw * Math.sign(st) * Math.pow(Math.abs(st), 2 / ex)]);
  }

  // uniform saturated fill, emitted bright (HDR > 1) so the bloom pass makes it glow.
  const fillMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: { uColor: { value: new THREE.Color('#ffc233') } },
    vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    // subtle half-transparent wash: dimmer (2.4) + lower opacity (0.15) so the fill reads
    // as a faint tint of the ground rather than a prominent glowing slab. The dashed border
    // still carries the bright glow; this is just the area inside it.
    fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor * 2.4, 0.15); }`,
  });
  const fillGeo = new THREE.ShapeGeometry(new THREE.Shape(sp.map(p => new THREE.Vector2(p[0], p[1]))));
  fillGeo.rotateX(-Math.PI / 2);
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.y = 0.25;
  group.add(fill);

  // evenly dashed border ribbon: resample the outline by arc length so every dash is the
  // same length and the dash/gap pattern wraps seamlessly around the loop.
  const seg = [], cum = [0]; let total = 0;
  for (let i = 0; i < N; i++) { const a = sp[i], c = sp[(i + 1) % N]; const l = Math.hypot(c[0]-a[0], c[1]-a[1]); seg.push(l); total += l; cum.push(total); }
  const at = s => { s = ((s % total) + total) % total; let i = 0; while (i < N - 1 && cum[i+1] < s) i++; const a = sp[i], c = sp[(i+1) % N], f = (s - cum[i]) / (seg[i] || 1e-6); return [a[0]+(c[0]-a[0])*f, -(a[1]+(c[1]-a[1])*f)]; };
  const periods = Math.max(6, Math.round(total / 22)), period = total / periods, dashLen = period * 0.66, hwid = 1.6;
  const pos = [], idx = []; let vi = 0;
  for (let k = 0; k < periods; k++) {
    const ds = k * period, subs = Math.max(2, Math.ceil(dashLen / 4));
    let prev = at(ds);
    for (let j = 1; j <= subs; j++) {
      const cur = at(ds + dashLen * j / subs);
      const dx = cur[0]-prev[0], dz = cur[1]-prev[1], len = Math.hypot(dx, dz) || 1e-6;
      // (nx,nz) is the OUTWARD normal. Pull the whole ribbon inward by its width so its
      // outer edge sits flush on the outline (= the fill edge) instead of straddling it.
      const nx = -dz/len*hwid, nz = dx/len*hwid;
      pos.push(prev[0],0,prev[1], cur[0],0,cur[1], cur[0]-2*nx,0,cur[1]-2*nz, prev[0]-2*nx,0,prev[1]-2*nz);
      idx.push(vi,vi+1,vi+2, vi,vi+2,vi+3); vi += 4;
      prev = cur;
    }
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bgeo.setIndex(idx);
  const border = new THREE.Mesh(bgeo, new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffea00'), transparent: true, opacity: 1.0, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  border.position.y = 0.6;
  group.add(border);

  parent.add(group);
  return { group, fillMat, border };
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
  const grid = new THREE.GridHelper(24000, 400, new THREE.Color('#9a8f7b'), new THREE.Color('#9a8f7b'));
  grid.position.y = 0.02;
  grid.material.transparent = true; grid.material.opacity = 0.28;   // warm expansion-joint lines in the concrete
  return grid;
}

function makeTrail(color) {
  const geo = new THREE.BufferGeometry();
  const m = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
  const line = new THREE.Line(geo, m); line.frustumCulled = false; line.visible = false;
  return line;
}

function makeTarget(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    colorSpace: THREE.NoColorSpace, depthBuffer: opts.depth !== false,
    samples: opts.samples || 0,
  });
}

// hand-written tonemap + grade (the droste "tail"): lens warp -> exposure ->
// exponential tonemap -> subtle vignette. Outputs linear; Three -> sRGB on screen.
function makePost() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScene: { value: null },
      uBloom: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },       // scene RT size
      uExposure: { value: 1.7 },
      uLens: { value: 0.06 },             // droste used 0.05; 0 = off. radial barrel strength
      uOverscan: { value: OVERSCAN },
      uBloom_k: { value: 1.0 },           // bloom add strength
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv; uniform sampler2D uScene, uBloom; uniform vec2 uRes;
      uniform float uExposure, uLens, uOverscan, uBloom_k;
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
        vec3 c = texture2D(uScene, suv).rgb;   // geometry AA already resolved by the MSAA target
        c += texture2D(uBloom, suv).rgb * uBloom_k;   // add the blurred highlights = glow
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

// bloom bright-pass: keep only the radiance above a threshold (so just the hot bay glows)
function makeBright() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uScene: { value: null }, uThreshold: { value: 1.35 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv; uniform sampler2D uScene; uniform float uThreshold;
      void main(){
        vec3 c = texture2D(uScene, vUv).rgb;
        gl_FragColor = vec4(max(c - vec3(uThreshold), 0.0), 1.0);   // per-channel: a white-hot core blooms in its dominant colour
      }`,
  });
  return { material };
}

// separable 9-tap gaussian (5 linear samples). uDir = texel * direction.
function makeBlur() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;
      void main(){
        vec3 c = texture2D(uTex, vUv).rgb * 0.227027;
        vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
        c += (texture2D(uTex, vUv + o1).rgb + texture2D(uTex, vUv - o1).rgb) * 0.3162162162;
        c += (texture2D(uTex, vUv + o2).rgb + texture2D(uTex, vUv - o2).rgb) * 0.0702702703;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return { material, texel: new THREE.Vector2() };
}
