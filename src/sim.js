// ---------------------------------------------------------------------------
// Deterministic simulation core for Trailer Trainer.
//
// Pure JS, no DOM — imported by BOTH the browser client and the Node server.
// The server re-runs submitted input logs through this exact code to verify
// leaderboard claims, so everything here must be deterministic given
// (level, seed, tick inputs): all randomness comes from the seeded PRNG, the
// integrator runs fixed 1/120s ticks with 1/240s substeps, and inputs are
// quantized (see packTicks) so client and server feed identical floats.
// Bump SIM_VERSION whenever physics/levels change in a way that alters runs.
// ---------------------------------------------------------------------------

export const SIM_VERSION = 1;
export const TICK = 1/120;

// ---- vehicle geometry (world units = px) ----
const L=44, carRearOv=10, carFrontOv=12, carW=30, carTrack=26;
const hitchC=18, draw_d=76, trailerW=30, trailerTrack=26;
const boxFront=22, boxBack=draw_d+20;
const wheelL=14, wheelW=6;
const CAR_HL=(L+carFrontOv+carRearOv)/2, CAR_HW=carW/2, CAR_CTR=(L+carFrontOv-carRearOv)/2;
const TR_HL=(boxBack-boxFront)/2, TR_HW=trailerW/2, TR_CTR=(boxFront+boxBack)/2;
export const G = { L, carRearOv, carFrontOv, carW, carTrack, hitchC, draw_d,
  trailerW, trailerTrack, boxFront, boxBack, wheelL, wheelW,
  CAR_HL, CAR_HW, CAR_CTR, TR_HL, TR_HW, TR_CTR };

// ---- articulation limits ----
export const JACK_TRIGGER = 72*Math.PI/180;   // fold this far -> game over
const MAX_ARTIC    = 82*Math.PI/180;          // hard clamp (just beyond, as a backstop)

// ---- engine / longitudinal (acceleration units, mass = 1; top speed ~ DRIVE/DRAG_L) ----
const DRIVE=55, REV=33, BRAKE=160, DRAG_L=0.045, ROLL_L=8;
export const MAX_SPEED=1200;
// ---- car tyres: grippy (precision parking focus) ----
const GRIP_F=380, GRIP_R=380, KSTIFF=9.0, REAR_LONG=0.0;
const LR=L*0.45, LF=L-LR, IZ=360, YAW_DAMP=2.2;
const STEER_REF=230, STEER_LO=0.22;           // speed-sensitive steering: understeer at pace
// ---- trailer drift (forward, above TR_SLIDE_LO): swinging mass on the hitch pin;
//      see the physics notes in the git history of main.js ----
const TR_SLIDE_LO=100, TR_SLIDE_HI=240;
const TR_KSTIFF=6;
const TR_MASS=0.9, TR_COG=draw_d;
const TR_IZ=1000, TR_IZD=TR_IZ+TR_MASS*TR_COG*TR_COG;
const TR_GRIP_D=230, TR_RELAX_D=60;
const SWAY_DAMP=0.45;
const PIN_CAP=600;
// handbrake: cuts rear grip + drags the rear, speed-gated
const HB_GRIP=0.9, HB_BRAKE=70;
export const MAX_STEER=36*Math.PI/180;

// ---- body dynamics (cosmetic; still simmed here so replays match exactly) ----
const PITCH_GAIN=0.0011, PITCH_MAX=0.060;
const ROLL_GAIN =0.0013, ROLL_MAX =0.052;
const SUS_K=95, SUS_D=9.0;
const TR_ROLL_GAIN =0.0014, TR_ROLL_MAX =0.062;
const TR_SUS_K=70, TR_SUS_D=7.0;

// ---- rewind double-buffer / death timing ----
const SAMPLE_INTERVAL=1.5, DEAD_TIME=1.45, DEAD_JITTER=0.22;
// ---- random start kink ----
const PERTURB=0.03, PERTURB_RAND=0.04;

export const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v,a,b) => v<a?a:(v>b?b:v);

// seeded PRNG (mulberry32): the ONLY randomness the sim ever uses
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// tick-input packing. A tick row is [dq, tq, rq, flags]:
//   dq    = round(steer angle * 8192)   (int)
//   tq/rq = round(throttle|reverse*255) (0..255)
//   flags = brake | handbrake<<1
// The CLIENT also drives its own sim through inputFromRow(row), so both sides
// compute from the exact same quantized floats. packTicks RLE-compresses runs
// of identical rows into [count, dq, tq, rq, flags].
// ---------------------------------------------------------------------------
export function rowFromInput(delta, thr, rev, brk, hb){
  return [Math.round(clamp(delta,-MAX_STEER,MAX_STEER)*8192),
          Math.round(clamp(thr,0,1)*255), Math.round(clamp(rev,0,1)*255),
          (brk?1:0)|(hb?2:0)];
}
export function inputFromRow(r){
  return { delta: r[0]/8192, thr: r[1]/255, rev: r[2]/255, brk: !!(r[3]&1), hb: !!(r[3]&2) };
}
export function packTicks(rows){
  const out=[]; let i=0;
  while(i<rows.length){
    const r=rows[i]; let n=1;
    while(i+n<rows.length){ const s=rows[i+n];
      if(s[0]!==r[0]||s[1]!==r[1]||s[2]!==r[2]||s[3]!==r[3]) break; n++; }
    out.push([n, r[0], r[1], r[2], r[3]]); i+=n;
  }
  return out;
}
export function unpackCount(packed){ let n=0; for(const p of packed) n+=p[0]; return n; }

// ---------------------------------------------------------------------------
// geometry helpers (collision / bay fit)
// ---------------------------------------------------------------------------
function corners(b){ const c=Math.cos(b.ang),s=Math.sin(b.ang);
  const ax=c*b.hl,ay=s*b.hl,bx=-s*b.hw,by=c*b.hw;
  return [[b.cx+ax+bx,b.cy+ay+by],[b.cx+ax-bx,b.cy+ay-by],[b.cx-ax-bx,b.cy-ay-by],[b.cx-ax+bx,b.cy-ay+by]]; }
function ptInBox(px,py,b,tol){ const dx=px-b.cx,dy=py-b.cy,c=Math.cos(b.ang),s=Math.sin(b.ang);
  const lx=dx*c+dy*s, ly=-dx*s+dy*c; return Math.abs(lx)<=b.hl+tol && Math.abs(ly)<=b.hw+tol; }
function allIn(box,bay,tol){ return corners(box).every(p=>ptInBox(p[0],p[1],bay,tol)); }
function circleHitsBox(px,py,r,b){ const dx=px-b.cx,dy=py-b.cy,c=Math.cos(b.ang),s=Math.sin(b.ang);
  const lx=dx*c+dy*s, ly=-dx*s+dy*c, clx=clamp(lx,-b.hl,b.hl), cly=clamp(ly,-b.hw,b.hw);
  return (lx-clx)**2+(ly-cly)**2 < r*r; }
function boxesOverlap(A,B){ const axes=[]; const add=b=>{const c=Math.cos(b.ang),s=Math.sin(b.ang);axes.push([c,s],[-s,c]);};
  add(A);add(B); const ca=corners(A),cb=corners(B);
  for(const [ax,ay] of axes){ let mnA=1e9,mxA=-1e9,mnB=1e9,mxB=-1e9;
    for(const[x,y]of ca){const p=x*ax+y*ay;if(p<mnA)mnA=p;if(p>mxA)mxA=p;}
    for(const[x,y]of cb){const p=x*ax+y*ay;if(p<mnB)mnB=p;if(p>mxB)mxB=p;}
    if(mxA<mnB||mxB<mnA) return false; }
  return true; }
function regionInside(rg,x,y){
  if(rg.t==="half"){ return rg.sign*((rg.axis==="x"?x:y)-rg.at) >= 0; }
  if(rg.t==="disc"){ const ins=(x-rg.cx)**2+(y-rg.cy)**2 <= rg.r*rg.r; return rg.mode==="out"?!ins:ins; }
  let inq, X = rg.flipx ? -x : x;
  if(X<rg.ex || y<rg.ey) inq=false;
  else if(X<rg.ccx && y<rg.ccy){
    const dx=Math.abs(X-rg.ccx), dy=Math.abs(y-rg.ccy);
    inq = rg.n ? (Math.pow(dx,rg.n)+Math.pow(dy,rg.n) <= Math.pow(rg.r,rg.n))
               : (dx*dx+dy*dy <= rg.r*rg.r);
  }
  else inq=true;
  return rg.mode==="in" ? inq : !inq;
}
function regionHit(rg,b){
  const c=Math.cos(b.ang), s=Math.sin(b.ang);
  const o=[[b.hl,b.hw],[b.hl,-b.hw],[-b.hl,b.hw],[-b.hl,-b.hw],[b.hl,0],[-b.hl,0],[0,b.hw],[0,-b.hw],[0,0]];
  for(const [lx,ly] of o){ if(regionInside(rg, b.cx+lx*c-ly*s, b.cy+lx*s+ly*c)) return true; }
  return false;
}

// ---------------------------------------------------------------------------
// createSim(level, seed): a fully deterministic run of one level.
//   level: a resolved level object from levels.js (bay already has hl/hw)
//   seed:  uint32 — drives start kink + death-timing jitter
// tick(inp) advances one TICK with inp = inputFromRow(row); returns an events
// object: {died?: 'wall'|'cone'|'jackknife', respawned?: true, done?: true}.
// ---------------------------------------------------------------------------
export function createSim(level, seed){
  const rng = mulberry32(seed);
  const s0 = level.start;
  const st = {x:s0.x,y:s0.y,theta:s0.th,phi:s0.th,delta:0,v:0,vlat:0,omega:0,omegaT:0,FyT:0,
      _hFx:0,_hFy:0,_pVhx:null,_pVhy:null,
      pitch:0,pitchV:0,roll:0,rollV:0,trRoll:0,trRollV:0,_ar:0,_gl:0,_aT:0};
  const pb = level.perturb ?? PERTURB;
  if(pb>0){ const sgn=rng()<0.5?-1:1; st.phi = s0.th + sgn*(pb + rng()*PERTURB_RAND); }
  if(level.lateral){ const sgn=rng()<0.5?-1:1, dd=sgn*level.lateral*(0.55+rng()*0.45);
    st.x += -Math.sin(s0.th)*dd; st.y += Math.cos(s0.th)*dd; }

  let holdT=0, levelDone=false, dead=false, deadT=0, deadDur=DEAD_TIME, sampleT=0;
  let runPath=0, runTime=0, runMoving=false;
  let hitWall=false;

  function snapshot(){ return {x:st.x,y:st.y,theta:st.theta,phi:st.phi,delta:st.delta,
    v:st.v,vlat:st.vlat,om:st.omega,omT:st.omegaT}; }
  let snaps=[snapshot()];
  function restore(s){
    st.x=s.x; st.y=s.y; st.theta=s.theta; st.phi=s.phi; st.delta=s.delta;
    st.v=s.v; st.vlat=s.vlat; st.omega=s.om; st.omegaT=s.omT;
    st.FyT=0; st._hFx=0; st._hFy=0; st._pVhx=st._pVhy=null;
  }

  function carBox(){ const c=Math.cos(st.theta),s=Math.sin(st.theta);
    return {cx:st.x+CAR_CTR*c, cy:st.y+CAR_CTR*s, ang:st.theta, hl:CAR_HL, hw:CAR_HW}; }
  function trailerBox(){ const c=Math.cos(st.theta),s=Math.sin(st.theta);
    const hx=st.x-hitchC*c, hy=st.y-hitchC*s, cp=Math.cos(st.phi), sp=Math.sin(st.phi);
    return {cx:hx-TR_CTR*cp, cy:hy-TR_CTR*sp, ang:st.phi, hl:TR_HL, hw:TR_HW}; }
  function checkFit(cb,tb){
    if(!level.bay) return false;
    const b=level.bay, bay={cx:b.x,cy:b.y,ang:b.ang,hl:b.hl,hw:b.hw};
    if(b.fit==="trailer") return allIn(tb,bay,3);
    if(b.fit==="car")     return allIn(cb,bay,3);
    return allIn(cb,bay,3) && allIn(tb,bay,3);
  }
  // 0..1 progress of the target sitting in the bay (drives the client's glow)
  function bayGlow(){
    if(!level.bay) return 0;
    if(levelDone) return 1;
    const b=level.bay, bay={cx:b.x,cy:b.y,ang:b.ang,hl:b.hl,hw:b.hw};
    const prog = box => { let sum=0;
      for(const p of corners(box)){ const dx=p[0]-bay.cx,dy=p[1]-bay.cy,c=Math.cos(bay.ang),s=Math.sin(bay.ang);
        const lx=dx*c+dy*s, ly=-dx*s+dy*c;
        sum += clamp(Math.min((bay.hl+3)-Math.abs(lx),(bay.hw+3)-Math.abs(ly))/12, 0, 1); }
      return sum/4; };
    if(b.fit==="car") return prog(carBox());
    if(b.fit==="rig") return Math.min(prog(carBox()),prog(trailerBox()));
    return prog(trailerBox());
  }

  function die(kind, ev){
    dead=true; deadT=0; st.v=0;
    deadDur = DEAD_TIME + (rng()*2-1)*DEAD_JITTER;
    ev.died=kind;
  }

  function tick(inp){
    const ev={};
    const dt=TICK;
    if(dead){
      deadT+=dt;
      if(deadT>=deadDur){ restore(snaps[0]); dead=false; deadT=0; holdT=0; ev.respawned=true; }
      return ev;
    }
    if(levelDone){ return ev; }   // run is over; ignore further input

    const throttle=inp.thr, reverse=inp.rev, braking=inp.brk?1:0, hb=inp.hb?1:0;
    st.delta = clamp(inp.delta, -MAX_STEER, MAX_STEER);
    const v0 = st.v, om0 = st.omega, omT0 = st.omegaT;

    const nsub=Math.max(1,Math.ceil(dt/(1/240))), h=dt/nsub;
    const d = LR + hitchC;
    for(let i=0;i<nsub;i++){
      const cth=Math.cos(st.theta), sth=Math.sin(st.theta);
      let u=st.v, w=st.vlat, om=st.omega;
      let cogx = st.x + LR*cth, cogy = st.y + LR*sth;

      const cph=Math.cos(st.phi), sph=Math.sin(st.phi);
      const cogvx0=u*cth - w*sth, cogvy0=u*sth + w*cth;
      const Vhx = cogvx0 + om*d*sth, Vhy = cogvy0 - om*d*cth;
      const omegaTkin = (Vhy*cph - Vhx*sph)/draw_d;
      const cArt = cth*cph + sth*sph, sArt = sth*cph - cth*sph;
      const yankBX =  cArt*st._hFx + sArt*st._hFy;
      const yankBY = -sArt*st._hFx + cArt*st._hFy;
      const yankTau = -d*yankBY;

      let Fx = throttle*DRIVE - reverse*REV;
      Fx -= braking*BRAKE*Math.tanh(u*0.4);
      Fx -= DRAG_L*u + ROLL_L*Math.tanh(u*3);
      const hbG = hb*clamp((u - 60)/90, 0, 1);
      Fx -= hbG*HB_BRAKE*Math.tanh(u*0.4);
      const sp = Math.hypot(u,w), den = Math.max(sp,3), su = u>=0?1:-1;
      const latFade = Math.min(1, sp/1.2);
      const dEff = st.delta*(STEER_LO + (1-STEER_LO)/(1 + (sp/STEER_REF)*(sp/STEER_REF)));
      const af = Math.atan2(w + LF*om, den) - dEff*su;
      const ar = Math.atan2(w - LR*om, den);
      const tract = throttle*DRIVE + braking*BRAKE + reverse*REV;
      const gl = Math.min(1, tract*REAR_LONG/GRIP_R);
      const grR = GRIP_R*Math.sqrt(Math.max(0.15, 1 - gl*gl))*(1 - HB_GRIP*hbG);
      const Fyf = -GRIP_F*latFade*Math.tanh(KSTIFF*af);
      const Fyr = -grR   *latFade*Math.tanh(KSTIFF*ar);

      const ax = Fx - Fyf*Math.sin(dEff) + w*om + yankBX;
      const ay = Fyf*Math.cos(dEff) + Fyr - u*om + yankBY;
      const omdot = (LF*Fyf*Math.cos(dEff) - LR*Fyr + yankTau)/IZ - YAW_DAMP*(1 - 0.6*hbG)*om;
      u = clamp(u + ax*h, -MAX_SPEED, MAX_SPEED);
      w += ay*h; om += omdot*h;

      st.theta += om*h;
      const c2=Math.cos(st.theta), s2=Math.sin(st.theta);
      const wvx = u*c2 - w*s2, wvy = u*s2 + w*c2;
      cogx += wvx*h; cogy += wvy*h;
      st.v=u; st.vlat=w; st.omega=om;
      st.x = cogx - LR*c2; st.y = cogy - LR*s2;

      let omegaT = omegaTkin, slipAng = 0;
      const sg = clamp((u - TR_SLIDE_LO)/(TR_SLIDE_HI - TR_SLIDE_LO), 0, 1), slideGate = sg*sg*(3-2*sg);
      if(slideGate > 0){
        const Vt = Math.max(Math.hypot(Vhx, Vhy), 1);
        slipAng = (omegaTkin - st.omegaT)*draw_d/Vt;
        const x = TR_KSTIFF*slipAng;
        const FyTarget = TR_GRIP_D * x/Math.sqrt(1 + x*x);
        st.FyT += (FyTarget - st.FyT)*Math.min(1, Vt*h/TR_RELAX_D);
        const ok = st._pVhx !== null;
        const aHx = ok ? clamp((Vhx - st._pVhx)/h, -4000, 4000) : 0;
        const aHy = ok ? clamp((Vhy - st._pVhy)/h, -4000, 4000) : 0;
        const aHt = aHx*cph + aHy*sph, aHl = -aHx*sph + aHy*cph;
        const omdT = (TR_MASS*TR_COG*aHl + draw_d*st.FyT)/TR_IZD - SWAY_DAMP*(st.omegaT - omegaTkin);
        const omegaDyn = clamp(st.omegaT + omdT*h, -8, 8);
        omegaT = omegaTkin + (omegaDyn - omegaTkin)*Math.exp(-(1-slideGate)*25*h);
        st._hFx = clamp(slideGate*(-TR_MASS*(aHt + TR_COG*st.omegaT*st.omegaT)), -PIN_CAP, PIN_CAP);
        st._hFy = clamp(slideGate*(-st.FyT - TR_MASS*(aHl - TR_COG*omdT)), -PIN_CAP, PIN_CAP);
      } else { st.FyT = 0; st._hFx = 0; st._hFy = 0; }
      st._pVhx = Vhx; st._pVhy = Vhy;
      st.omegaT = omegaT;
      st.phi += st.omegaT*h;
      st._aT = Math.abs(slipAng)*slideGate;
      const rel=norm(st.theta-st.phi);
      if(rel> MAX_ARTIC){ st.phi=st.theta-MAX_ARTIC; st.omegaT=om; }
      if(rel<-MAX_ARTIC){ st.phi=st.theta+MAX_ARTIC; st.omegaT=om; }

      st._ar=Math.abs(ar); st._gl=gl;
    }

    // body attitude (cosmetic but simmed for replay-exactness of nothing — it
    // never feeds back into the dynamics; kept here so client render state is
    // one object and the code stays in one place)
    const aLong  = (st.v - v0)/dt;
    const aLatC  = st.v*st.omega + (st.omega-om0)/dt*LR;
    const aLatT  = st.v*st.omegaT + (st.omegaT-omT0)/dt*draw_d*0.5;
    const spring = (ang,vel,target,k,dd)=>{ const a=k*(target-ang)-dd*vel; return [ang+vel*dt, vel+a*dt]; };
    [st.pitch, st.pitchV] = spring(st.pitch, st.pitchV, clamp( aLong *PITCH_GAIN, -PITCH_MAX, PITCH_MAX), SUS_K, SUS_D);
    [st.roll,  st.rollV ] = spring(st.roll,  st.rollV,  clamp(-aLatC *ROLL_GAIN,  -ROLL_MAX,  ROLL_MAX ), SUS_K, SUS_D);
    [st.trRoll,st.trRollV] = spring(st.trRoll,st.trRollV,clamp(-aLatT *TR_ROLL_GAIN,-TR_ROLL_MAX,TR_ROLL_MAX), TR_SUS_K, TR_SUS_D);

    // jackknife -> rewind
    if(Math.abs(norm(st.theta - st.phi)) >= JACK_TRIGGER){ die("jackknife", ev); return ev; }

    // scoring clock: rear-axle distance + time from first motion
    if(level.id!=="free" && !levelDone){
      runPath += Math.abs(st.v)*dt;
      if(!runMoving && Math.abs(st.v)>2) runMoving=true;
      if(runMoving) runTime += dt;
    }

    // collisions + fit
    const cb=carBox(), tb=trailerBox();
    hitWall=false; let hitCone=false;
    for(const o of level.obstacles){
      if(o.t==="cone"){
        if(circleHitsBox(o.x,o.y,(o.r||10)+1,cb)||circleHitsBox(o.x,o.y,(o.r||10)+1,tb)) hitCone=true;
      }
      else if(o.t==="wall"){ const ob={cx:o.x,cy:o.y,ang:o.ang,hl:o.hl,hw:o.hw}; if(boxesOverlap(ob,cb)||boxesOverlap(ob,tb)) hitWall=true; }
      else if(regionHit(o,cb)||regionHit(o,tb)) hitWall=true;
    }
    if(hitCone){ die("cone", ev); return ev; }
    if(hitWall){ die("wall", ev); return ev; }

    const fitNow=checkFit(cb,tb);
    const inPosition = fitNow && Math.abs(st.v)<5;
    if(level.id!=="free"){
      if(inPosition){ holdT+=dt; if(holdT>0.55 && !levelDone){ levelDone=true; ev.done=true; } }
      else holdT=0;
    }

    // sample for rewind (keep two most recent: jump-back lands 1.5–3s old)
    sampleT+=dt;
    if(sampleT>=SAMPLE_INTERVAL){ snaps.push(snapshot()); if(snaps.length>2) snaps.shift(); sampleT-=SAMPLE_INTERVAL; }
    return ev;
  }

  return {
    st, tick, level, seed, bayGlow,
    get dead(){ return dead; },
    get done(){ return levelDone; },
    get moving(){ return runMoving; },
    metrics(){ return { timeMs: Math.round(runTime*1000), dist: Math.round(runPath) }; },
  };
}

// Replay a packed input log to completion. Returns {done, timeMs, dist, ticks}.
// Used by the server verifier (and determinism tests).
export function replay(level, seed, packed, maxTicks = 72000){
  const sim = createSim(level, seed);
  let n = 0;
  for(const row of packed){
    const count = row[0], inp = inputFromRow([row[1],row[2],row[3],row[4]]);
    for(let i=0;i<count;i++){
      n++;
      if(n > maxTicks) return { done:false, reason:"too_long", ticks:n };
      const ev = sim.tick(inp);
      if(ev.done) return { done:true, ...sim.metrics(), ticks:n };
    }
  }
  return { done:false, reason:"never_finished", ticks:n, ...sim.metrics() };
}
