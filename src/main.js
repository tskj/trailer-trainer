import { createScene } from './render3d.js';

(() => {
  "use strict";
  // ---- vehicle geometry (world units = px) ----
  const L=44, carRearOv=10, carFrontOv=12, carW=30, carTrack=26;
  const hitchC=18, draw_d=76, trailerW=30, trailerTrack=26;
  const boxFront=22, boxBack=draw_d+20;
  const wheelL=14, wheelW=6;
  const CAR_HL=(L+carFrontOv+carRearOv)/2, CAR_HW=carW/2, CAR_CTR=(L+carFrontOv-carRearOv)/2;
  const TR_HL=(boxBack-boxFront)/2, TR_HW=trailerW/2, TR_CTR=(boxFront+boxBack)/2;

  // ---- 3D renderer (Three.js scene; see render3d.js) ----
  const glCanvas = document.getElementById("gl");
  const R = createScene(glCanvas, { L, carRearOv, carFrontOv, carW, carTrack, hitchC, draw_d,
    trailerW, trailerTrack, boxFront, boxBack, wheelL, wheelW, CAR_HL, CAR_HW, CAR_CTR, TR_HL, TR_HW, TR_CTR });
  addEventListener("resize", () => R.resize());

  // ---- articulation limits ----
  const JACK_TRIGGER = 72*Math.PI/180;   // fold this far -> game over
  const MAX_ARTIC    = 82*Math.PI/180;   // hard clamp (just beyond, as a backstop)

  // ---- engine / longitudinal (acceleration units, mass = 1; top speed ~ DRIVE/DRAG_L) ----
  const DRIVE=400, REV=90, BRAKE=520, DRAG_L=1.05, ROLL_L=16;   // terminal ~380 (much faster)
  const MAX_SPEED=440;                              // safety clamp
  // ---- tyres: lateral grip is a saturating slip-angle force (grip below the
  //      limit -> follows the heading like before; past it -> slides/drifts) ----
  const GRIP_F=190, GRIP_R=140, KSTIFF=9.0, REAR_LONG=0.27;  // REAR_LONG: throttle/brake eats rear grip (RWD power-oversteer)
  const LR=L*0.45, LF=L-LR, IZ=360, YAW_DAMP=3.0;   // COG offsets, yaw inertia, spin damping (catchable drift)
  // ---- trailer tyre: grips at parking speed (~old kinematic feel), slides at the
  //      limit; braking locks its wheel so it fishtails on the brakes ----
  const GRIP_T=88, KT=8.0, IT=550, DAMP_T=4.5, TBRAKE_GRIP=0.22;
  const COUPLE=0.55;                                // how hard the trailer yanks the car back (two-way)
  // ---- steering: no auto-centre, so a set turn radius is held ----
  const MAX_STEER=36*Math.PI/180;
  // keyboard steering mirrors the throttle: force + viscous drag + coulomb return,
  // so tapping nudges the wheel and it eases back to centre (mouse still set-and-holds)
  const STEER_FORCE=1.2, STEER_DRAG=1.6, STEER_ROLL=0.05;

  // ---- rewind double-buffer ----
  const SAMPLE_INTERVAL=1.5, DEAD_TIME=1.0;

  // ---- bays sized to the actual rig footprint ----
  const BAY = {
    trailer:{ hl: TR_HL+13, hw: TR_HW+11 },
    car:    { hl: CAR_HL+13, hw: CAR_HW+11 },
    rig:    { hl: (CAR_HL+CAR_CTR + hitchC+boxBack)/2 + 14, hw: 15+9 }
  };
  const W = (x,y,ang,hl,hw)=>({t:"wall",x,y,ang,hl,hw});
  // chain of short wall segments approximating an arc (for curved corridors)
  function arcWalls(cx,cy,r,a0,a1,segs,hw){
    const out=[];
    for(let i=0;i<segs;i++){
      const t0=a0+(a1-a0)*i/segs, t1=a0+(a1-a0)*(i+1)/segs;
      const x0=cx+r*Math.cos(t0), y0=cy+r*Math.sin(t0);
      const x1=cx+r*Math.cos(t1), y1=cy+r*Math.sin(t1);
      out.push(W((x0+x1)/2,(y0+y1)/2, Math.atan2(y1-y0,x1-x0), Math.hypot(x1-x0,y1-y0)/2+1.5, hw));
    }
    return out;
  }

  const LEVELS = [
    { id:"free", name:"Free drive",
      goal:"Sandbox — practice turning and backing. Turn trails on to see how each wheel path cuts inside the one ahead.",
      start:{x:0,y:0,th:-Math.PI/2}, bay:null, obstacles:[] },

    { id:"intro", name:"1 · Roll-up",
      goal:"Easy start: drive forward, thread between the cones, and roll the trailer onto the pad — then stop with it sitting square. No walls here; clipping a cone is just a fault.",
      start:{x:-300,y:0,th:0}, lateral:26,
      bay:{x:150,y:0,ang:0,fit:"trailer"},
      obstacles:[ {t:"cone",x:-150,y:-34},{t:"cone",x:-150,y:34},
                  {t:"cone",x:-40,y:-34},{t:"cone",x:-40,y:34},
                  {t:"cone",x:70,y:-34},{t:"cone",x:70,y:34} ] },

    { id:"sweep", name:"2 · Short sweep",
      goal:"Follow the curve — one slow 90° turn around the inside corner — and ease the trailer onto the pad at the exit. Touch the wall and you rewind.",
      start:{x:-420,y:200,th:-Math.PI/2},
      bay:{x:175,y:-398,ang:0,fit:"trailer"},
      obstacles:[ {t:"quad",ex:-360,ey:-360,ccx:0,ccy:0,r:360,mode:"in",n:8} ] },

    { id:"roundabout", name:"3 · Roundabout",
      goal:"Drive up to the roundabout and take it counter-clockwise — around the island the long way to the exit on the left, then ease the trailer onto the pad. Cutting the corner clips the cone.",
      start:{x:0,y:360,th:-Math.PI/2},
      bay:{x:-340,y:0,ang:0,fit:"trailer"},
      obstacles:[ {t:"disc",cx:0,cy:0,r:85,mode:"in"},
                  {t:"quad",ex:110,ey:110,ccx:270,ccy:270,r:160,mode:"in",n:8},
                  {t:"quad",ex:110,ey:110,ccx:270,ccy:270,r:160,mode:"in",n:8,flipx:true},
                  {t:"cone",x:-120,y:95} ] },

    { id:"sweepLong", name:"4 · Long sweep",
      goal:"The same turn, 3.5\u00d7 bigger: a long, sustained sweep around a far larger corner. Keep it smooth and ease the trailer onto the pad.",
      start:{x:-1320,y:-700,th:-Math.PI/2},
      bay:{x:-700,y:-1298,ang:0,fit:"trailer"},
      obstacles:[ {t:"quad",ex:-1260,ey:-1260,ccx:0,ccy:0,r:1260,mode:"in",n:8} ] },

    { id:"l1", name:"5 · Straight back-in",
      goal:"Your first reverse. The trailer starts slightly kinked, so you can't back dead straight — steer to line it up and back it to the wall. Clip a corner cone and it's a fault; ram the wall and you reset.",
      start:{x:0,y:-220,th:-Math.PI/2}, perturb:0.05,
      bay:{x:0,y:60,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:122,sign:1},
                  {t:"cone",x:-40,y:18},{t:"cone",x:40,y:18} ] },

    { id:"l2", name:"6 · Offset back-in",
      goal:"The pocket is off to the side. Line the trailer up and back it in square.",
      start:{x:55,y:-400,th:-Math.PI/2},
      bay:{x:150,y:60,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:122,sign:1},
                  {t:"cone",x:116,y:18},{t:"cone",x:184,y:18} ] },

    { id:"l3", name:"7 · 90° alley dock",
      goal:"Drive up the lane and PAST the bay, then back in with one continuous 90° turn. The long wall opposite leaves no room to straighten out.",
      start:{x:-310,y:-30,th:0},
      bay:{x:80,y:90,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:-129,sign:-1},
                  {t:"half",axis:"y",at:152,sign:1},
                  {t:"cone",x:44,y:48},{t:"cone",x:116,y:48} ] },

    { id:"l4", name:"8 · Inside the cut",
      goal:"Turn left into the bay nose-first. The trailer cuts inside the car, so take the corner wide to keep it off the apex cones — but stay inside the walls.",
      start:{x:-250,y:135,th:0},
      bay:{x:165,y:-120,ang:Math.PI/2,fit:"car"},
      obstacles:[ {t:"cone",x:80,y:78},{t:"cone",x:120,y:30},{t:"cone",x:150,y:-25},
                  {t:"half",axis:"x",at:237,sign:1},
                  {t:"half",axis:"y",at:180,sign:1},
                  {t:"half",axis:"y",at:-189,sign:-1} ] },

    { id:"l5", name:"9 · Parallel park",
      goal:"Back the trailer into the slot between the two parked cars, parallel to the curb.",
      start:{x:-160,y:85,th:0},
      bay:{x:30,y:-12,ang:0,fit:"trailer"},
      obstacles:[ W(-90,-12,0,30,15), W(150,-12,0,30,15),
                  {t:"half",axis:"y",at:-49,sign:-1} ] },

    { id:"l6", name:"10 · Garage (whole rig)",
      goal:"Pull the entire rig — car and trailer — fully inside the garage without clipping the walls.",
      start:{x:0,y:240,th:-Math.PI/2},
      bay:{x:0,y:-30,ang:Math.PI/2,fit:"rig"},
      obstacles:[ {t:"half",axis:"y",at:-149,sign:-1},
                  W(-47,-30,Math.PI/2,132,11), W(47,-30,Math.PI/2,132,11) ] }
  ];

  // ---- state ----
  let st, cam, level, levelIdx, holdT, levelDone, faults, wasCone, hitWall, hitCone, inPosition, fitNow;
  let dead, deadT, sampleT, snaps, locked=false, camRot=0, thrDisp=0, teleported=false, mouseSteer=false;
  let rotateFollow=true;
  let runPath=0, runTime=0, runMoving=false, naming=false, pending=null, myEntry=null;
  const completed = new Set();
  // leaderboards: per level, two top-N lists (shortest distance, quickest time).
  // ranking is cones-first (fewer touched always wins), then the metric. persisted if storage allows.
  const LB_N=5;
  function loadBoards(){ try{ return JSON.parse(localStorage.getItem("trailerTrainer.boards")||"{}"); }catch(e){ return {}; } }
  function saveBoards(){ try{ localStorage.setItem("trailerTrainer.boards", JSON.stringify(boards)); }catch(e){} }
  let lastName=""; try{ lastName=localStorage.getItem("trailerTrainer.lastName")||""; }catch(e){}
  const boards = loadBoards();
  const cmp = metric => (a,b)=> (a.cones-b.cones) || (a[metric]-b[metric]);
  function boardFor(id){ return boards[id] || (boards[id]={dist:[],time:[]}); }
  function qualifies(list, entry, metric){ return list.length<LB_N || cmp(metric)(entry, list[list.length-1])<0; }
  function isTop(list, entry, metric){ return list.length===0 || cmp(metric)(entry, list[0])<0; }
  function knownNames(){ const s=new Set(); for(const id in boards){ for(const mk of ["dist","time"]) (boards[id][mk]||[]).forEach(e=>{ if(e.name) s.add(e.name); }); } if(lastName) s.add(lastName); return [...s].slice(0,8); }
  const trails = { front:[], rear:[], trailer:[] };
  let trailsOn = false;
  const TRAIL_MAX=700, TRAIL_MIN=3;

  const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v,a,b) => v<a?a:(v>b?b:v);
  const $ = id => document.getElementById(id);

  // OKLab interpolation for the steering bar (cyan -> amber -> red as you near full lock)
  const _s2l = c => c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4);
  const _l2s = c => c<=0.0031308 ? 12.92*c : 1.055*Math.pow(c,1/2.4)-0.055;
  function _rgbLab(h){ h=h.replace("#","");
    let r=_s2l(parseInt(h.slice(0,2),16)/255), g=_s2l(parseInt(h.slice(2,4),16)/255), b=_s2l(parseInt(h.slice(4,6),16)/255);
    const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
    const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
    const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
    return [0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s]; }
  function _labRgb([L,A,B]){
    const l=(L+0.3963377774*A+0.2158037573*B)**3, m=(L-0.1055613458*A-0.0638541728*B)**3, s=(L-0.0894841775*A-1.2914855480*B)**3;
    const cl=v=>Math.max(0,Math.min(255,Math.round(_l2s(v)*255)));
    return `rgb(${cl(4.0767416621*l-3.3077115913*m+0.2309699292*s)},${cl(-1.2684380046*l+2.6097574011*m-0.3413193965*s)},${cl(-0.0041960863*l-0.7034186147*m+1.7076147010*s)})`; }
  const _C=_rgbLab("#39c2d7"), _A=_rgbLab("#f59f3b"), _Wn=_rgbLab("#ff5a52");
  function steerColor(t){ let p,q,f; if(t<=0.55){p=_C;q=_A;f=t/0.55;} else {p=_A;q=_Wn;f=(t-0.55)/0.45;}
    return _labRgb([0,1,2].map(i=>p[i]+(q[i]-p[i])*f)); }

  // ---- audio buzzer ----
  let actx=null;
  function buzz(){
    try{
      actx = actx || new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      const t=actx.currentTime;
      [70,104].forEach((freq,i)=>{
        const o=actx.createOscillator(), g=actx.createGain();
        o.type="square"; o.frequency.value=freq;
        o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.16,t+0.02);
        g.gain.setValueAtTime(0.16,t+0.34);
        g.gain.linearRampToValueAtTime(0,t+0.46);
        o.start(t); o.stop(t+0.47);
      });
    }catch(e){}
  }
  function clack(){
    try{
      actx = actx || new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      const t=actx.currentTime;
      // noise transient (the knock)
      const len=Math.floor(actx.sampleRate*0.06), buf=actx.createBuffer(1,len,actx.sampleRate), dat=buf.getChannelData(0);
      for(let i=0;i<len;i++) dat[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);
      const n=actx.createBufferSource(); n.buffer=buf;
      const nf=actx.createBiquadFilter(); nf.type="bandpass"; nf.frequency.value=440; nf.Q.value=0.9;
      const ng=actx.createGain(); ng.gain.value=0.17;
      n.connect(nf); nf.connect(ng); ng.connect(actx.destination); n.start(t);
      // hollow tok with a quick pitch drop
      const o=actx.createOscillator(), g=actx.createGain();
      o.type="triangle"; o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(150,t+0.09);
      g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.13,t+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t+0.13);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t+0.14);
    }catch(e){}
  }
  function chime(){
    try{
      actx = actx || new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      const t=actx.currentTime;
      [523.25,659.25,783.99,1046.5].forEach((f,i)=>{
        const o=actx.createOscillator(), g=actx.createGain(), ts=t+i*0.085;
        o.type="triangle"; o.frequency.value=f;
        g.gain.setValueAtTime(0.0001,ts);
        g.gain.exponentialRampToValueAtTime(0.16,ts+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001,ts+0.55);
        o.connect(g); g.connect(actx.destination); o.start(ts); o.stop(ts+0.57);
      });
    }catch(e){}
  }
  // ---- procedural engine sound (talk-style: RPM-driven harmonics + noise) ----
  let engine=null;
  function ensureEngine(){
    if(engine) return;
    try{
      actx = actx || new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      const master=actx.createGain(); master.gain.value=0.0; master.connect(actx.destination);
      // waveshaper for grit/growl: soft-clip everything through it
      const shaper=actx.createWaveShaper(); shaper.oversample="2x";
      { const n=1024, c=new Float32Array(n), k=3.2; for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(k*x); } shaper.curve=c; }
      shaper.connect(master);
      const bus=actx.createGain(); bus.gain.value=1.0; bus.connect(shaper);   // dry mix into the shaper
      // 0.5x sub-octave for the deep rumble, then fundamental + a couple of harmonics
      const oscs=[0.5,1,2,3].map((mult,i)=>{
        const o=actx.createOscillator(); o.type=["triangle","sawtooth","square","triangle"][i]; o.frequency.value=24*mult;
        const g=actx.createGain(); g.gain.value=[0.62,0.42,0.14,0.05][i];
        o.connect(g); g.connect(bus); o.start(); return {o,mult};
      });
      // looping noise -> low bandpass: the bulk of the "engine feel" per the talk
      const buf=actx.createBuffer(1,actx.sampleRate,actx.sampleRate), d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
      const noise=actx.createBufferSource(); noise.buffer=buf; noise.loop=true;
      const nf=actx.createBiquadFilter(); nf.type="bandpass"; nf.frequency.value=180; nf.Q.value=0.5;
      const ng=actx.createGain(); ng.gain.value=0.0;
      noise.connect(nf); nf.connect(ng); ng.connect(bus); noise.start();
      engine={master,oscs,nf,ng};
    }catch(e){ engine=null; }
  }
  function updateEngine(speed, throttleAmt){
    if(!engine||!actx) return;
    const t=actx.currentTime, sp=Math.abs(speed), load=Math.min(1,Math.abs(throttleAmt)), rev=Math.min(1,sp/MAX_SPEED);
    // deep, growly firing frequency (sub-octave + sqrt-compressed top so it rumbles)
    const f0=20 + Math.sqrt(sp)*1.9 + load*5;            // idle ~20Hz, max ~55Hz (sub an octave below)
    for(const {o,mult} of engine.oscs) o.frequency.setTargetAtTime(f0*mult, t, 0.06);
    engine.nf.frequency.setTargetAtTime(90 + sp*1.0, t, 0.06);
    engine.ng.gain.setTargetAtTime(0.24*(0.4+0.6*load), t, 0.08);
    engine.master.gain.setTargetAtTime(0.05*(0.45+0.55*rev+0.4*load), t, 0.08);
  }

  // ---- input ----
  const keys = new Set();
  const isFwd =()=>keys.has("ArrowUp")||keys.has("e")||keys.has("i");
  const isRev =()=>keys.has("ArrowDown")||keys.has("d")||keys.has("k");
  const isLeft=()=>keys.has("ArrowLeft")||keys.has("s")||keys.has("j");
  const isRight=()=>keys.has("ArrowRight")||keys.has("f")||keys.has("l");
  const isBrake=()=>keys.has("Control");                         // Ctrl = brakes
  const MOVE=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","e","s","d","f","i","j","k","l","Control"];
  addEventListener("keydown", e=>{
    if(naming) return;
    const k = e.key.length===1 ? e.key.toLowerCase() : e.key;
    ensureEngine();                                              // first key starts the engine audio
    if(k==="r"){ loadLevel(levelIdx); return; }
    if(k==="n"||k===" "){ if(levelDone||level.id==="free") nextLevel(); e.preventDefault(); return; }
    if(MOVE.includes(k)){ keys.add(k); e.preventDefault(); }
  });
  addEventListener("keyup", e=>{ const k=e.key.length===1?e.key.toLowerCase():e.key; keys.delete(k); });
  addEventListener("blur", ()=>keys.clear());

  // mouse steering: relative (movementX) when the pointer is captured, absolute X otherwise.
  const stageEl = document.querySelector(".stage");
  stageEl.addEventListener("mousemove", e=>{
    if(!st) return;
    mouseSteer = true;                          // mouse now owns the wheel; suppress keyboard centre-snap
    const r = stageEl.getBoundingClientRect();
    if(locked){
      // match the non-captured feel: full lock == moving across half the view width
      st.delta = clamp(st.delta + e.movementX*(MAX_STEER/(r.width*0.5)), -MAX_STEER, MAX_STEER);
    } else {
      const frac = clamp((e.clientX - r.left)/r.width*2 - 1, -1, 1);
      const m = Math.pow(Math.abs(frac), 1.4);   // no deadband; the curve eases the centre
      st.delta = Math.sign(frac) * m * MAX_STEER;
    }
  });
  stageEl.addEventListener("click", e=>{
    if(e.target.id!=="gl") return;                       // only capture on the canvas, not overlay buttons
    ensureEngine();
    if(document.pointerLockElement!==stageEl && stageEl.requestPointerLock){
      try{ stageEl.requestPointerLock(); }catch(_){}
    }
  });
  document.addEventListener("pointerlockchange", ()=>{
    locked = (document.pointerLockElement===stageEl);
    const h=$("lockHint");
    if(h) h.textContent = locked ? "mouse captured · Esc to release" : "click the view to capture the mouse";
  });

  function bayDims(b){ const d=BAY[b.fit]; return {hl:b.hl||d.hl, hw:b.hw||d.hw}; }

  // ---- snapshots for rewind ----
  function snapshot(){ return {x:st.x,y:st.y,theta:st.theta,phi:st.phi,delta:st.delta,
    tf:trails.front.length,tr:trails.rear.length,tt:trails.trailer.length}; }
  function restore(s){
    st.x=s.x; st.y=s.y; st.theta=s.theta; st.phi=s.phi; st.delta=s.delta; st.v=0; st.vlat=0; st.omega=0; st.omegaT=0;
    trails.front.length=Math.min(trails.front.length,s.tf);
    trails.rear.length =Math.min(trails.rear.length, s.tr);
    trails.trailer.length=Math.min(trails.trailer.length,s.tt);
  }

  function loadLevel(i){
    levelIdx=i; level=LEVELS[i];
    const s=level.start;
    st={x:s.x,y:s.y,theta:s.th,phi:s.th,delta:0,v:0,vlat:0,omega:0,omegaT:0};
    if(level.perturb){ const sgn=Math.random()<0.5?-1:1; st.phi = s.th + sgn*(level.perturb + Math.random()*0.06); }
    if(level.lateral){ const sgn=Math.random()<0.5?-1:1, d=sgn*level.lateral*(0.55+Math.random()*0.45);
      st.x += -Math.sin(s.th)*d; st.y += Math.cos(s.th)*d; }
    holdT=0; levelDone=false; faults=0; wasCone=false; hitWall=false; hitCone=false; inPosition=false; fitNow=false;
    runPath=0; runTime=0; runMoving=false; myEntry=null;
    dead=false; deadT=0; sampleT=0;
    trails.front.length=trails.rear.length=trails.trailer.length=0;
    cam={x:s.x,y:s.y}; camRot = -Math.PI/2 - st.theta;
    snaps=[snapshot()];   // always have at least one fallback
    currState=prevState=captureState(); acc=0; teleported=false;   // reset interpolation

    // build the 3D scene for this level; cones get tagged with o._m for hit-recolor
    for(const o of level.obstacles){ if(o.t==="cone") o.hit=false; }
    R.buildLevel(level, level.bay ? bayDims(level.bay) : null);

    $("banner").classList.remove("show");
    $("dead").classList.remove("show");
    $("ring").classList.remove("on");
    refreshLevelUI();
  }
  function nextLevel(){ loadLevel((levelIdx+1)%LEVELS.length); }

  function carBox(){ const c=Math.cos(st.theta),s=Math.sin(st.theta);
    return {cx:st.x+CAR_CTR*c, cy:st.y+CAR_CTR*s, ang:st.theta, hl:CAR_HL, hw:CAR_HW}; }
  function trailerBox(){ const c=Math.cos(st.theta),s=Math.sin(st.theta);
    const hx=st.x-hitchC*c, hy=st.y-hitchC*s, cp=Math.cos(st.phi), sp=Math.sin(st.phi);
    return {cx:hx-TR_CTR*cp, cy:hy-TR_CTR*sp, ang:st.phi, hl:TR_HL, hw:TR_HW}; }
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
  // area keep-out regions: half-plane, and rounded quadrant (inside/outside)
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
  function checkFit(cb,tb){
    if(!level.bay) return false;
    const d=bayDims(level.bay), bay={cx:level.bay.x,cy:level.bay.y,ang:level.bay.ang,hl:d.hl,hw:d.hw};
    if(level.bay.fit==="trailer") return allIn(tb,bay,3);
    if(level.bay.fit==="car")     return allIn(cb,bay,3);
    return allIn(cb,bay,3) && allIn(tb,bay,3);
  }

  function triggerDead(kind){
    dead=true; deadT=0; st.v=0;
    $("deadBig").textContent = kind==="wall" ? "Crunch!" : "Jackknifed";
    $("dead").classList.add("show"); $("ring").classList.add("on");
    buzz();
  }
  function respawn(){
    restore(snaps[0]);                 // older buffered state: ~1.5–3s back
    dead=false; deadT=0;
    $("dead").classList.remove("show"); $("ring").classList.remove("on");
    holdT=0;
    teleported=true;                   // snap render, don't interpolate across the jump
  }

  function step(dt){
    if(dead){ deadT+=dt; if(deadT>=DEAD_TIME) respawn(); return; }

    // longitudinal + lateral dynamics are integrated in the substep loop below
    const throttle = isFwd()?1:0, reverse = isRev()?1:0, braking = isBrake()?1:0;

    // steering. The mouse owns the wheel and HOLDS any angle (set-and-hold).
    // Keyboard mirrors the throttle (force + viscous drag + coulomb return) so it
    // taps like acc/rev and eases back toward centre on release.
    if(isLeft()||isRight()) mouseSteer=false;          // keyboard reclaims the wheel
    if(!mouseSteer){
      let sf=0; if(isLeft()) sf-=STEER_FORCE; if(isRight()) sf+=STEER_FORCE;
      st.delta += sf*dt;
      st.delta -= STEER_DRAG*st.delta*dt;
      const sr=STEER_ROLL*dt; if(st.delta>sr) st.delta-=sr; else if(st.delta<-sr) st.delta+=sr; else st.delta=0;
    }
    st.delta = clamp(st.delta, -MAX_STEER, MAX_STEER);

    // dynamic single-track model with a dynamic trailer, TWO-WAY coupled at the
    // hitch: the car's tyres slide past their grip limit (drift), and the trailer's
    // tyre force feeds back through the hitch to yank the car around (so a high-speed
    // fold throws the car instead of ending the run).
    const nsub=Math.max(1,Math.ceil(dt/(1/240))), h=dt/nsub;
    const d = LR + hitchC;                                  // COG -> hitch distance
    for(let i=0;i<nsub;i++){
      const cth=Math.cos(st.theta), sth=Math.sin(st.theta);
      let u=st.v, w=st.vlat, om=st.omega;
      let cogx = st.x + LR*cth, cogy = st.y + LR*sth;        // COG = rear axle + LR forward

      // --- trailer tyre force first, so it can yank the car this substep ---
      const cogvx0=u*cth - w*sth, cogvy0=u*sth + w*cth;      // COG world velocity (start)
      const Vhx = cogvx0 + om*d*sth, Vhy = cogvy0 - om*d*cth; // hitch world velocity
      const cph=Math.cos(st.phi), sph=Math.sin(st.phi);
      const twx = Vhx + st.omegaT*draw_d*sph, twy = Vhy - st.omegaT*draw_d*cph;
      const vFwdT = twx*cph + twy*sph, vLatT = -twx*sph + twy*cph;
      const fadeT = Math.min(1, Math.hypot(vFwdT,vLatT)/3);
      const aT = Math.atan2(vLatT, Math.max(Math.abs(vFwdT), 3));
      const gT = GRIP_T*(braking ? TBRAKE_GRIP : 1);        // brakes lock the trailer wheel -> fishtail
      const Flat = -gT*fadeT*Math.tanh(KT*aT);              // trailer lateral tyre force (signed)
      // that force, in world, reacts on the car at the hitch (the "yank")
      const Ftx=-Flat*sph, Fty=Flat*cph;
      const yX=COUPLE*Ftx, yY=COUPLE*Fty;
      const yankBX = yX*cth + yY*sth, yankBY = -yX*sth + yY*cth;   // -> car body frame
      const yankTau = d*(sth*yX - cth*yY);                  // r_hitch x F  (r=-d*heading)

      // --- car longitudinal + lateral tyres ---
      let Fx = throttle*DRIVE - reverse*REV;
      Fx -= braking*BRAKE*Math.tanh(u*0.4);                 // brake opposes forward motion
      Fx -= DRAG_L*u + ROLL_L*Math.tanh(u*3);               // viscous + coulomb resistance
      const sp = Math.hypot(u,w), den = Math.max(sp,3), su = u>=0?1:-1;
      const latFade = Math.min(1, sp/3);                    // fade lateral grip at a crawl (avoids jitter)
      const af = Math.atan2(w + LF*om, den) - st.delta*su;
      const ar = Math.atan2(w - LR*om, den);
      const tract = throttle*DRIVE + braking*BRAKE + reverse*REV;
      const gl = Math.min(1, tract*REAR_LONG/GRIP_R);       // RWD friction circle: drive/brake eats rear grip
      const grR = GRIP_R*Math.sqrt(Math.max(0.15, 1 - gl*gl));
      const Fyf = -GRIP_F*latFade*Math.tanh(KSTIFF*af);
      const Fyr = -grR   *latFade*Math.tanh(KSTIFF*ar);

      const ax = Fx - Fyf*Math.sin(st.delta) + w*om + yankBX;
      const ay = Fyf*Math.cos(st.delta) + Fyr - u*om + yankBY;
      const omdot = (LF*Fyf*Math.cos(st.delta) - LR*Fyr + yankTau)/IZ - YAW_DAMP*om;
      u = clamp(u + ax*h, -MAX_SPEED, MAX_SPEED);
      w += ay*h; om += omdot*h;

      st.theta += om*h;
      const c2=Math.cos(st.theta), s2=Math.sin(st.theta);
      const wvx = u*c2 - w*s2, wvy = u*s2 + w*c2;
      cogx += wvx*h; cogy += wvy*h;
      st.v=u; st.vlat=w; st.omega=om;
      st.x = cogx - LR*c2; st.y = cogy - LR*s2;             // back to rear-axle reference

      // --- integrate the trailer (torque about hitch + damping toward co-rotation) ---
      const omTdot = (-draw_d*Flat)/IT - DAMP_T*(st.omegaT - om);
      st.omegaT += omTdot*h;
      st.phi += st.omegaT*h;
      const rel=norm(st.theta-st.phi);
      if(rel> MAX_ARTIC){ st.phi=st.theta-MAX_ARTIC; st.omegaT=om; }
      if(rel<-MAX_ARTIC){ st.phi=st.theta+MAX_ARTIC; st.omegaT=om; }

      st._ar=Math.abs(ar); st._gl=gl; st._aT=Math.abs(aT);  // slip metrics for skidmarks
    }

    // highscore tracking: rear-axle distance (integral of |v|), and time from first motion until cleared
    if(level.id!=="free" && !levelDone){
      runPath += Math.abs(st.v)*dt;
      if(!runMoving && Math.abs(st.v)>2) runMoving=true;
      if(runMoving) runTime += dt;
    }

    // collisions + fit
    const cb=carBox(), tb=trailerBox();
    hitWall=false; let coneNow=false;
    for(const o of level.obstacles){
      if(o.t==="cone"){
        if(circleHitsBox(o.x,o.y,(o.r||10)+1,cb)||circleHitsBox(o.x,o.y,(o.r||10)+1,tb)){
          coneNow=true;
          if(!o.hit){ o.hit=true; clack(); R.coneHit(o); }
        }
      }
      else if(o.t==="wall"){ const ob={cx:o.x,cy:o.y,ang:o.ang,hl:o.hl,hw:o.hw}; if(boxesOverlap(ob,cb)||boxesOverlap(ob,tb)) hitWall=true; }
      else if(regionHit(o,cb)||regionHit(o,tb)) hitWall=true;
    }
    if(coneNow&&!wasCone) faults++;
    wasCone=coneNow; hitCone=coneNow;

    // hit a wall -> rewind. A jackknife no longer kills the run: the trailer just
    // yanks the car around (two-way coupling above), so a fold throws you instead.
    if(hitWall){ triggerDead("wall"); return; }

    fitNow=checkFit(cb,tb);
    inPosition = fitNow && Math.abs(st.v)<5 && !hitWall;
    if(level.id!=="free"){
      if(inPosition){ holdT+=dt; if(holdT>0.55 && !levelDone){ levelDone=true; completed.add(level.id); recordResult(); showBanner(); } }
      else holdT=0;
    }

    // sample for rewind (keep two most recent: jump-back lands 1.5–3s old)
    sampleT+=dt;
    if(sampleT>=SAMPLE_INTERVAL){ snaps.push(snapshot()); if(snaps.length>2) snaps.shift(); sampleT-=SAMPLE_INTERVAL; }
  }

  function recordResult(){
    const lb=boardFor(level.id);
    const entry={name:"", cones:faults, dist:runPath, time:runTime};
    const qd=qualifies(lb.dist,entry,"dist"), qt=qualifies(lb.time,entry,"time");
    if(qd||qt){
      pending={entry, lb, qd, qt, topD:qd&&isTop(lb.dist,entry,"dist"), topT:qt&&isTop(lb.time,entry,"time")};
      openNameModal();
    } else pending=null;
  }
  function showBanner(){
    chime();
    $("bannerBig").textContent="Level clear";
    let tag="";
    if(pending){
      tag = (pending.topD&&pending.topT) ? " \u00b7 new records!"
          : pending.topD ? " \u00b7 new shortest distance!"
          : pending.topT ? " \u00b7 new quickest time!"
          : " \u00b7 made the leaderboard!";
    }
    const cones = faults===0 ? "clean run" : faults+" cone"+(faults>1?"s":"")+" touched";
    $("bannerSub").textContent = `distance ${Math.round(runPath)} \u00b7 ${runTime.toFixed(1)}s \u00b7 ${cones}${tag}`;
    $("banner").classList.add("show");
    refreshLevelUI();
  }

  function render(prev, curr, alpha){
    const rs = lerpState(prev, curr, alpha);            // interpolated render pose
    const c=Math.cos(rs.theta), s=Math.sin(rs.theta);
    const hitchX=rs.x-hitchC*c, hitchY=rs.y-hitchC*s;
    const frontX=rs.x+L*c, frontY=rs.y+L*s;
    const cp=Math.cos(rs.phi), sp=Math.sin(rs.phi);
    const trAxX=hitchX-draw_d*cp, trAxY=hitchY-draw_d*sp;

    let tx, ty;
    if(rotateFollow){ const bk=52; tx=rs.x - bk*Math.cos(rs.theta); ty=rs.y - bk*Math.sin(rs.theta); } else { tx=(frontX+trAxX)/2; ty=(frontY+trAxY)/2; }
    cam.x+=(tx-cam.x)*0.18; cam.y+=(ty-cam.y)*0.18;
    if(rotateFollow) camRot += norm((-Math.PI/2 - rs.theta) - camRot)*0.2;

    // trails: sample the interpolated wheel positions
    if(trailsOn && !dead){ pushTrail(trails.front,frontX,frontY); pushTrail(trails.rear,rs.x,rs.y); pushTrail(trails.trailer,trAxX,trAxY); }

    // hand the interpolated pose + view state to the 3D renderer
    R.update(
      {x:rs.x, y:rs.y, theta:rs.theta, phi:rs.phi, delta:rs.delta},
      {camX:cam.x, camY:cam.y, camRot, rotateFollow, bayActive:(inPosition||levelDone), trails, trailsOn, dead}
    );

    // skidmarks: lay rubber at the rear wheels when the tail slips/spins, and at the
    // trailer wheels when it fishtails. (lateral dir = (-s,c) for car, (-sp,cp) for trailer)
    const htC=carTrack/2, htT=trailerTrack/2;
    const rearSkid  = !dead && (st._ar>0.18 || (st._gl>0.8 && Math.abs(st.v)>10));
    const trailSkid = !dead && st._aT>0.2;
    R.updateSkids([
      {key:'rl', x:rs.x - s*htC,  y:rs.y + c*htC,  on:rearSkid},
      {key:'rr', x:rs.x + s*htC,  y:rs.y - c*htC,  on:rearSkid},
      {key:'tl', x:trAxX - sp*htT, y:trAxY + cp*htT, on:trailSkid},
      {key:'tr', x:trAxX + sp*htT, y:trAxY - cp*htT, on:trailSkid},
    ]);

    // off-screen goal arrow: project the bay to the canvas, clamp to the edge
    const ga=$("goalArrow");
    if(level.bay){
      const p=R.project(level.bay.x, level.bay.y);
      const cw=glCanvas.clientWidth, ch=glCanvas.clientHeight, m=26;
      const onscreen = p.visible && p.x>=m && p.x<=cw-m && p.y>=m && p.y<=ch-m;
      if(onscreen) ga.style.display="none";
      else {
        let dx=p.x-cw/2, dy=p.y-ch/2;
        if(p.behind){ dx=-dx; dy=-dy; }
        const sc=Math.min((cw/2-m)/(Math.abs(dx)||1e-6), (ch/2-m)/(Math.abs(dy)||1e-6));
        ga.style.transform=`translate(${cw/2+dx*sc-17}px,${ch/2+dy*sc-17}px) rotate(${Math.atan2(dy,dx)}rad)`;
        ga.style.display="";
      }
    } else ga.style.display="none";

    const deg=st.delta*180/Math.PI;            // HUD steer readout uses live input

    const artic=norm(st.theta-st.phi);
    $("hSpeed").textContent=Math.abs(st.v).toFixed(0);
    $("hGear").textContent=st.v>1?"D":(st.v<-1?"R":"N");
    $("hSteer").textContent=(deg>=0?"R ":"L ")+Math.abs(deg).toFixed(0)+"\u00B0";
    $("hArtic").textContent=Math.abs(artic*180/Math.PI).toFixed(0)+"\u00B0";
    const frac=clamp(artic/JACK_TRIGGER,-1,1), near=Math.abs(frac)>0.7, fill=$("articFill");
    fill.style.width=Math.abs(frac)*50+"%";
    fill.style.transform=frac<0?"translateX(-100%)":"none";
    fill.style.background=near?"var(--warn)":"var(--cyan)";

    const drifting = Math.abs(st.vlat) > 6;
    const status=$("status");
    if(dead){ status.textContent="REWINDING"; status.className="status warn"; }
    else if(levelDone){ status.textContent="CLEAR"; status.className="status good"; }
    else if(near){ status.textContent="EASE OFF"; status.className="status warn"; }
    else if(hitWall){ status.textContent="CONTACT"; status.className="status warn"; }
    else if(drifting){ status.textContent="DRIFTING"; status.className="status warn"; }
    else if(inPosition){ status.textContent="IN POSITION"; status.className="status good"; }
    else { status.textContent = st.v<-1?"REVERSING":(st.v>1?"DRIVING":"READY"); status.className="status"; }
    $("faults").textContent="faults: "+faults;

    // steering bar
    const fr = clamp(st.delta/MAX_STEER, -1, 1), mg = Math.abs(fr), Wp = mg*50;
    const sf = $("steerFill"), hx = $("steerHatch");
    if(fr>=0){
      sf.style.left="50%"; sf.style.right="auto"; sf.style.width=Wp+"%"; sf.style.borderRadius="0 99px 99px 0";
      hx.style.clipPath="inset(0 "+(50-Wp)+"% 0 50% round 0 99px 99px 0)";
    } else {
      sf.style.right="50%"; sf.style.left="auto"; sf.style.width=Wp+"%"; sf.style.borderRadius="99px 0 0 99px";
      hx.style.clipPath="inset(0 50% 0 "+(50-Wp)+"% round 99px 0 0 99px)";
    }
    sf.style.backgroundColor = steerColor(mg);
    $("steerMid").textContent = "STEER \u00B7 "+Math.abs(deg).toFixed(0)+"\u00B0 "+(deg>0.5?"R":(deg<-0.5?"L":""));

    $("kUp").classList.toggle("lit",isFwd()); $("kDown").classList.toggle("lit",isRev());
    $("kLeft").classList.toggle("lit",isLeft()); $("kRight").classList.toggle("lit",isRight());

    // throttle gauge: inertial low-pass of the input (slow rise, slower decay) so tapping
    // accumulates and coasts down instead of snapping — the bar carries momentum like the rig does
    const tgt=(isFwd()?1:0)-(isRev()?1:0);
    const rate = (Math.abs(tgt) > Math.abs(thrDisp) || (tgt!==0 && Math.sign(tgt)!==Math.sign(thrDisp))) ? 0.05 : 0.022;
    thrDisp += (tgt-thrDisp)*rate;
    if(Math.abs(thrDisp)<0.002) thrDisp=0;
    const tf=$("thrFill");
    if(thrDisp>=0){ tf.style.top=(50-50*thrDisp)+"%"; tf.style.height=(50*thrDisp)+"%"; tf.style.background="var(--good)"; }
    else { tf.style.top="50%"; tf.style.height=(50*-thrDisp)+"%"; tf.style.background="var(--warn)"; }

    updateEngine(st.v, thrDisp);
    updateRunLine();
  }
  const fmtDist=d=>Math.round(d).toString();
  const fmtTime=t=>t.toFixed(1)+"s";
  function updateRunLine(){
    $("recRun").textContent = level.id==="free" ? "\u2014"
      : (fmtDist(runPath)+"  \u00b7  "+(runMoving?fmtTime(runTime):"0.0s")+"  \u00b7  "+faults+"c");
  }
  function renderBoard(elId, list, metric){
    const box=$(elId); box.replaceChildren();
    if(!list||!list.length){ const d=document.createElement("div"); d.className="board-empty"; d.textContent="no entries yet"; box.appendChild(d); return; }
    list.forEach((e,i)=>{ const row=document.createElement("div"); row.className="brow"+(e===myEntry?" mine":"");
      const rank=document.createElement("span"); rank.className="br-rank"; rank.textContent=(i+1);
      const name=document.createElement("span"); name.className="br-name"; name.textContent=e.name;
      const cone=document.createElement("span"); cone.className="br-cone"+(e.cones===0?" clean":""); cone.textContent=e.cones+"c";
      const val=document.createElement("span"); val.className="br-val"; val.textContent=metric==="dist"?fmtDist(e.dist):fmtTime(e.time);
      row.append(rank,name,cone,val); box.appendChild(row); });
  }
  function refreshBoards(){
    if(level.id==="free"){ $("boardDist").innerHTML='<div class="board-empty">free drive — no scoring</div>'; $("boardTime").replaceChildren(); return; }
    const lb=boards[level.id]||{dist:[],time:[]};
    renderBoard("boardDist", lb.dist, "dist"); renderBoard("boardTime", lb.time, "time");
  }
  function openNameModal(){
    naming=true; keys.clear();
    const p=pending, where=p.qd&&p.qt?"both boards":p.qd?"the distance board":"the time board";
    $("nmTitle").textContent = (p.topD||p.topT) ? "New highscore!" : "Leaderboard!";
    $("nmSub").textContent = `You made ${where} — distance ${Math.round(runPath)}, time ${runTime.toFixed(1)}s, ${faults} cone${faults===1?"":"s"}.`;
    const chips=$("nmChips"); chips.replaceChildren();
    knownNames().forEach(nm=>{ const b=document.createElement("button"); b.textContent=nm; b.onclick=()=>submitName(nm); chips.appendChild(b); });
    const inp=$("nmInput"); inp.value=lastName||"";
    $("nameModal").classList.add("show");
    setTimeout(()=>{ inp.focus(); inp.select(); },30);
  }
  function submitName(name){
    const p=pending; if(!p){ closeNameModal(); return; }
    name=(name||"").trim().slice(0,14) || "Anon";
    p.entry.name=name; myEntry=p.entry;
    if(p.qd){ p.lb.dist.push(p.entry); p.lb.dist.sort(cmp("dist")); if(p.lb.dist.length>LB_N) p.lb.dist.length=LB_N; }
    if(p.qt){ p.lb.time.push(p.entry); p.lb.time.sort(cmp("time")); if(p.lb.time.length>LB_N) p.lb.time.length=LB_N; }
    lastName=name; try{ localStorage.setItem("trailerTrainer.lastName",name); }catch(e){}
    saveBoards(); pending=null; closeNameModal(); refreshBoards();
  }
  function closeNameModal(){ naming=false; $("nameModal").classList.remove("show"); }
  function pushTrail(a,x,y){ const l=a[a.length-1]; if(l&&(l[0]-x)**2+(l[1]-y)**2<TRAIL_MIN*TRAIL_MIN)return;
    a.push([x,y]); if(a.length>TRAIL_MAX)a.shift(); }

  function refreshLevelUI(){
    $("goal").textContent=level.goal;
    refreshBoards();
    $("prog").textContent=completed.size+" / "+(LEVELS.length-1)+" cleared";
    const list=$("levelList");
    if(list.childElementCount!==LEVELS.length){
      list.replaceChildren();
      LEVELS.forEach((lv,i)=>{ const b=document.createElement("button"); b.className="lvl";
        b.innerHTML=`<span class="tick"></span>${lv.name}`; b.onclick=()=>loadLevel(i); list.appendChild(b); });
    }
    [...list.children].forEach((b,i)=>{ b.classList.toggle("active",i===levelIdx);
      b.querySelector(".tick").textContent = completed.has(LEVELS[i].id)?"\u2713":""; });
  }

  $("btnTrails").onclick=e=>{ trailsOn=!trailsOn; e.target.textContent="Trails: "+(trailsOn?"on":"off"); e.target.classList.toggle("on",trailsOn); };
  $("btnClear").onclick=()=>{ trails.front.length=trails.rear.length=trails.trailer.length=0; };
  $("btnReset").onclick=()=>loadLevel(levelIdx);
  $("btnCam").onclick=e=>{ rotateFollow=!rotateFollow;
    if(rotateFollow && st) camRot = -Math.PI/2 - st.theta;
    e.target.textContent="Camera: "+(rotateFollow?"follow car":"top-down");
    e.target.classList.toggle("on",rotateFollow); };
  $("btnNext").onclick=()=>nextLevel();
  $("nmSave").onclick=()=>submitName($("nmInput").value);
  $("nmSkip").onclick=()=>{ pending=null; myEntry=null; closeNameModal(); };
  $("nmInput").addEventListener("keydown", e=>{
    if(e.key==="Enter") submitName($("nmInput").value);
    else if(e.key==="Escape"){ pending=null; myEntry=null; closeNameModal(); }
    e.stopPropagation();
  });

  // ---- fixed-timestep loop (droste-style accumulator + interpolation) ----
  // The sim advances in fixed TICK steps, decoupled from render FPS. Render draws
  // an interpolated pose between the two most recent ticks (by `alpha`), so motion
  // is smooth and deterministic at any frame rate. Teleports (respawn / level load)
  // snap instead of interpolating, to avoid streaking across the jump.
  const TICK = 1/120, MAX_STEPS_PER_FRAME = 8;
  const lerpN  = (a,b,t)=> a + (b-a)*t;
  const lerpAng= (a,b,t)=> a + norm(b-a)*t;          // shortest-arc angle interpolation
  function captureState(){ return {x:st.x,y:st.y,theta:st.theta,phi:st.phi,delta:st.delta,v:st.v}; }
  function lerpState(p,c,t){ return {
    x:lerpN(p.x,c.x,t), y:lerpN(p.y,c.y,t),
    theta:lerpAng(p.theta,c.theta,t), phi:lerpAng(p.phi,c.phi,t),
    delta:lerpN(p.delta,c.delta,t), v:c.v }; }

  let prevState=null, currState=null, acc=0, last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; last=now;
    dt=Math.min(dt,0.25);                              // ignore huge gaps (tab was backgrounded)
    if(naming){ acc=0; render(currState,currState,0); requestAnimationFrame(frame); return; }
    acc+=dt;
    let steps=0;
    while(acc>=TICK){
      prevState=currState;
      step(TICK);
      currState=captureState();
      acc-=TICK;
      if(teleported){ prevState=currState; acc=0; teleported=false; }
      if(++steps>=MAX_STEPS_PER_FRAME){ acc=0; break; }   // spiral-of-death guard
    }
    render(prevState, currState, clamp(acc/TICK,0,1));
    requestAnimationFrame(frame);
  }

  R.resize();
  loadLevel(1);
  requestAnimationFrame(frame);

  // debug telemetry hook (read by test scripts)
  window.__tt = () => ({ v:st.v, vlat:st.vlat, om:st.omega, omT:st.omegaT, delta:st.delta, artic:norm(st.theta-st.phi)*57.3, ar:st._ar, gl:st._gl, aT:st._aT, skids:R.skidCountDbg?R.skidCountDbg():-1 });
})();
