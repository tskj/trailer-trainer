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
  // same gentle push off the line (DRIVE unchanged), but drag is ~10x lower so the
  // drag-limited top speed is ~10x higher (~1040) and the climb takes a long, long time
  // to get there — it just keeps slowly pulling. Forward is mostly for repositioning.
  const DRIVE=55, REV=33, BRAKE=160, DRAG_L=0.045, ROLL_L=8;
  const MAX_SPEED=1200;                            // safety clamp (above the ~1040 drag-limited top)
  // ---- tyres: very grippy now (precision parking focus) — the car holds its line
  //      and never slides/drifts from its own inputs ----
  const GRIP_F=380, GRIP_R=380, KSTIFF=9.0, REAR_LONG=0.0;
  const LR=L*0.45, LF=L-LR, IZ=360, YAW_DAMP=2.2;   // COG offsets, yaw inertia, spin damping
  // speed-sensitive steering: full authority at parking speeds, eased down toward STEER_LO
  // as speed builds, so the front bites less and pushes wide (understeer) instead of darting.
  const STEER_REF=230, STEER_LO=0.22;               // half-falloff speed, high-speed authority floor (lower = more understeer)
  // trailer drift (forward, above TR_SLIDE_LO): the trailer becomes a real swinging MASS
  // on the hitch pin. Its rotation about the hitch is a DRIVEN PENDULUM — yank the pivot
  // sideways (a steering flick) and the load slings out; a SATURATING tyre at the axle
  // pulls it back toward rolling true (the force plateaus rather than collapsing past
  // breakaway, so a swing is catchable with countersteer instead of self-amplifying).
  // The full pin constraint force — tyre force plus the inertial reaction of the swinging
  // mass — is applied back onto the car at the hitch, so a thrown trailer genuinely
  // THROWS the car: every whip trades forward speed for rotation. Gated to zero at low
  // speed and in all reverse, so parking and backing are untouched.
  const TR_SLIDE_LO=100, TR_SLIDE_HI=240;           // forward-speed range over which drift physics fade in
  const TR_KSTIFF=6;                                 // tyre slip stiffness (saturates ~1/6 rad)
  const TR_MASS=0.9, TR_COG=draw_d;                  // trailer mass (car=1) with its CoG at the axle (under the pile)
  const TR_IZ=1000, TR_IZD=TR_IZ+TR_MASS*TR_COG*TR_COG;  // yaw inertia about CoG / about the hitch pin
  const TR_GRIP_D=230, TR_RELAX_D=60;                // tyre grip (saturating), short relaxation lag (weight, not self-pumping)
  const SWAY_DAMP=0.45;                              // tyre-scrub damping on the swing (1/s) — rounds a max flick off below the jackknife edge
  const PIN_CAP=600;                                 // safety cap on the hitch constraint force
  // handbrake (Shift): cuts rear grip + drags the rear — the drift initiator. Gated on
  // forward speed so parking / reversing never feel it.
  const HB_GRIP=0.9, HB_BRAKE=70;
  // ---- trailer: KINEMATIC no-slip rolling constraint (see step()). No tyre/grip
  //      constants — the wheel can't slip sideways, so it tracks cleanly at any speed
  //      and reverse folds toward a jackknife (JACK_TRIGGER) if you don't correct. ----
  // ---- steering: no auto-centre, so a set turn radius is held ----
  const MAX_STEER=36*Math.PI/180;
  // keyboard steering mirrors the throttle: force + viscous drag + coulomb return,
  // so tapping nudges the wheel and it eases back to centre (mouse still set-and-holds)
  const STEER_FORCE=1.2, STEER_DRAG=1.6, STEER_ROLL=0.05;

  // ---- body dynamics (cosmetic only): a sprung mass on a spring-damper. Longitudinal
  //      acceleration pitches the car (squat under power, dive under braking) and lateral
  //      acceleration rolls it into a lean. Underdamped, so it bobs and settles instead of
  //      snapping. The trailer gets its own softer version, coupled through the hitch. ----
  const PITCH_GAIN=0.0011, PITCH_MAX=0.060;         // rad per unit long-accel, hard clamp (~3.4°; the spring overshoots a touch past it)
  const ROLL_GAIN =0.0013, ROLL_MAX =0.052;         // rad per unit lat-accel,  hard clamp (~3.0°)
  const SUS_K=95, SUS_D=9.0;                          // spring stiffness / damping (omega_n~9.7, zeta~0.46 -> a small contained bob)
  // trailer pitch isn't sprung here — it's derived in the renderer from the (tilted) car's
  // hitch height so the tongue stays coupled and the wheels stay grounded (and so it gets
  // subtler automatically as the car's pitch shrinks). Only its lateral lean is sprung (a
  // ball-jointed hitch lets the trailer roll independently of the car).
  const TR_ROLL_GAIN =0.0014, TR_ROLL_MAX =0.062;
  const TR_SUS_K=70, TR_SUS_D=7.0;                   // softer, slower trailer suspension

  // ---- rewind double-buffer ----
  const SAMPLE_INTERVAL=1.5, DEAD_TIME=1.45;  // red fail-flash clears fairly quickly; the buzz keeps fading out past it
  const DEAD_JITTER=0.22;                      // +/- small random wobble on the reset timing so it doesn't feel metronomic

  // ---- every level starts the trailer slightly kinked (random side + amount) so you can
  //      never just back dead-straight. A level may override with its own `perturb`, or set
  //      perturb:0 to opt out. ----
  const PERTURB=0.03, PERTURB_RAND=0.04;      // base + random extra (rad); ~1.7°–4° either way

  // ---- bays sized to the actual rig footprint ----
  const BAY = {
    trailer:{ hl: TR_HL+9, hw: TR_HW+8 },
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

    { id:"l1", name:"1 · Straight back-in",
      goal:"Your first reverse. The trailer starts slightly kinked, so you can’t back dead straight — steer to line it up and back it to the wall. Clip a cone or ram the wall and you reset.",
      start:{x:0,y:-220,th:-Math.PI/2},
      bay:{x:0,y:60,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:122,sign:1},
                  {t:"cone",x:-40,y:18},{t:"cone",x:40,y:18} ] },

    { id:"l2", name:"2 · Offset back-in",
      goal:"The pocket is off to the side. Line the trailer up and back it in square.",
      start:{x:55,y:-400,th:-Math.PI/2},
      bay:{x:150,y:60,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:122,sign:1},
                  {t:"cone",x:116,y:18},{t:"cone",x:184,y:18} ] },

    { id:"l6", name:"3 · Garage ↩",
      goal:"Reverse the trailer all the way down the long cone channel and tuck it into the spot against the back wall — thread the cones, and stop before you hit the wall.",
      start:{x:0,y:390,th:Math.PI/2},
      bay:{x:0,y:-70,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:-122,sign:-1},
                  {t:"cone",x:-45,y:311},{t:"cone",x:-45,y:259},{t:"cone",x:-45,y:207},{t:"cone",x:-45,y:155},{t:"cone",x:-45,y:103},{t:"cone",x:-45,y:51},{t:"cone",x:-45,y:-1},{t:"cone",x:-45,y:-53},{t:"cone",x:-45,y:-105},
                  {t:"cone",x:45,y:311},{t:"cone",x:45,y:259},{t:"cone",x:45,y:207},{t:"cone",x:45,y:155},{t:"cone",x:45,y:103},{t:"cone",x:45,y:51},{t:"cone",x:45,y:-1},{t:"cone",x:45,y:-53},{t:"cone",x:45,y:-105} ] },

    { id:"sweep", name:"4 · Short sweep ↩",
      goal:"Now in reverse: back the trailer around the bend and ease it up the far leg onto the pad. Keep the trailer off the wall the whole way around.",
      start:{x:160,y:-398,th:0},
      bay:{x:-420,y:180,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"quad",ex:-360,ey:-360,ccx:0,ccy:0,r:360,mode:"in",n:8},
                  {t:"cone",x:-438,y:250},{t:"cone",x:-402,y:250} ] },

    { id:"roundabout", name:"5 · Roundabout ↩",
      goal:"Reverse the trailer around the island and back it onto the pad in the left arm. The island’s on the inside — take it wide.",
      start:{x:0,y:330,th:Math.PI/2},
      bay:{x:-340,y:0,ang:0,fit:"trailer"},
      obstacles:[ {t:"disc",cx:0,cy:0,r:85,mode:"in"},
                  {t:"quad",ex:110,ey:110,ccx:270,ccy:270,r:160,mode:"in",n:8},
                  {t:"quad",ex:110,ey:110,ccx:270,ccy:270,r:160,mode:"in",n:8,flipx:true},
                  {t:"cone",x:-120,y:95},{t:"cone",x:-92,y:62},
                  {t:"cone",x:-410,y:-18},{t:"cone",x:-410,y:18} ] },

    { id:"sweepLong", name:"6 · Long sweep ↩",
      goal:"The big one, in reverse: back the trailer around the long, sustained bend and up onto the pad at the far end. Slow and smooth.",
      start:{x:-680,y:-1298,th:0},
      bay:{x:-1320,y:-720,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"quad",ex:-1260,ey:-1260,ccx:0,ccy:0,r:1260,mode:"in",n:8},
                  {t:"cone",x:-1338,y:-650},{t:"cone",x:-1302,y:-650} ] },

    { id:"l5", name:"7 · Parallel park",
      goal:"Back the trailer into the cone-marked slot against the curb. You start past the far end facing away, so swing the rig round before you can reverse in. Three cones wall off one end, a single cone marks the other — don't clip them.",
      start:{x:220,y:85,th:Math.PI},
      bay:{x:30,y:-12,ang:0,fit:"trailer"},
      obstacles:[ {t:"cone",x:-32,y:-36},{t:"cone",x:-32,y:-12},{t:"cone",x:-32,y:12},
                  {t:"cone",x:175,y:8},
                  {t:"half",axis:"y",at:-49,sign:-1} ] },

    { id:"l3", name:"8 · 90° alley dock",
      goal:"Drive up the lane and PAST the bay, then back in with one continuous 90° turn. The long wall opposite leaves no room to straighten out.",
      start:{x:-310,y:-30,th:0},
      bay:{x:80,y:90,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"y",at:-129,sign:-1},
                  {t:"half",axis:"y",at:152,sign:1},
                  {t:"cone",x:44,y:48},{t:"cone",x:116,y:48} ] },

    { id:"slalom", name:"9 · Reverse slalom ↩",
      goal:"The capstone, all in reverse: weave the trailer back through the cone slalom — left of one, right of the next — then straighten it into the bay at the end. The lane walls leave no room to cheat wide, and clipping a cone now ends the run.",
      start:{x:0,y:840,th:Math.PI/2},
      bay:{x:0,y:-310,ang:Math.PI/2,fit:"trailer"},
      obstacles:[ {t:"half",axis:"x",at:-56,sign:-1}, {t:"half",axis:"x",at:56,sign:1},
                  {t:"cone",x:-18,y:-380},{t:"cone",x:18,y:-380},
                  {t:"cone",x:-18,y:610},{t:"cone",x:18,y:420},{t:"cone",x:-18,y:230},{t:"cone",x:18,y:40},{t:"cone",x:-18,y:-150} ] }
  ];

  // ---- state ----
  let st, cam, level, levelIdx, holdT, levelDone, hitWall, hitCone, inPosition, fitNow;
  let dead, deadT, deadDur=DEAD_TIME, sampleT, snaps, locked=false, camRot=0, camLook=0, thrDisp=0, teleported=false, mouseSteer=false, camSnap=false;
  let rotateFollow=true;
  let runPath=0, runTime=0, runMoving=false, naming=false, pending=null, myEntry=null, bayGlowCur=0;
  const completed = new Set();   // levels cleared (clipping a cone now resets, so a clear is always clean)
  // leaderboards: per level, two top-N lists (shortest distance, quickest time), ranked on the
  // metric alone. persisted if storage allows.
  const LB_N=5;
  function loadBoards(){ try{ return JSON.parse(localStorage.getItem("trailerTrainer.boards")||"{}"); }catch(e){ return {}; } }
  function saveBoards(){ try{ localStorage.setItem("trailerTrainer.boards", JSON.stringify(boards)); }catch(e){} }
  let lastName=""; try{ lastName=localStorage.getItem("trailerTrainer.lastName")||""; }catch(e){}
  const boards = loadBoards();
  const cmp = metric => (a,b)=> a[metric]-b[metric];
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
  // bay glow fill: warm amber -> green (OKLab); low blue + lower green so it reads gold/amber, not lime
  const _bayLo=_rgbLab("#ffc233"), _bayHi=_rgbLab("#3fce6c");
  function bayColorAt(t){ return _labRgb([0,1,2].map(i=>_bayLo[i]+(_bayHi[i]-_bayLo[i])*t)); }
  // dashed border: a punchier / brighter amber -> green
  const _beLo=_rgbLab("#ffb01a"), _beHi=_rgbLab("#1fbe54");
  function bayEdgeAt(t){ return _labRgb([0,1,2].map(i=>_beLo[i]+(_beHi[i]-_beLo[i])*t)); }

  // ---- audio buzzer ----
  let actx=null;
  function buzz(){
    try{
      actx = actx || new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      const t=actx.currentTime;
      [58,87].forEach((freq,i)=>{
        const o=actx.createOscillator(), g=actx.createGain();
        o.type="triangle"; o.frequency.value=freq;          // softer than square -> gentler buzz
        o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0,t);
        g.gain.linearRampToValueAtTime(0.08,t+0.05);         // quick attack
        g.gain.setValueAtTime(0.08,t+0.9);                   // hold the buzz
        g.gain.exponentialRampToValueAtTime(0.0001,t+3.4);   // long slow fade — keeps trailing off after the reset
        o.start(t); o.stop(t+3.45);
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
  // ---- procedural engine sound: an absurdly deep, lazy V8 rumble ----
  // The exhaust is synthesised as a PULSE TRAIN (AudioWorklet), not a steady waveform:
  // every cylinder firing kicks a damped exhaust resonator plus a lowpassed combustion
  // noise burst, and the pulses land in the UNEVEN per-bank pattern of a crossplane V8
  // (banks collect L R R L R L L R) — which is where the real-life lumpy
  // "potato-potato" burble comes from. Per-pulse random amplitude keeps the idle
  // organic, and a sub sine glued to the firing fundamental carries the chest floor.
  // Idle fires at ~24Hz (a comically huge ~360rpm engine for a tiny moving car).
  const V8_SRC = `registerProcessor("v8-rumble", class extends AudioWorkletProcessor {
    static get parameterDescriptors(){ return [
      {name:"firing", defaultValue:26, minValue:5, maxValue:220, automationRate:"k-rate"},
      {name:"load",   defaultValue:0,  minValue:0, maxValue:1,   automationRate:"k-rate"}]; }
    constructor(){ super();
      this.ph=0; this.sub=0; this.lpn=0;
      this.evL=[0,270,450,540].map(d=>d/720);   // crossplane exhaust events (deg/720):
      this.evR=[90,180,360,630].map(d=>d/720);  // per-bank gaps 90/180/270 -> the burble
      this.L={y:0,v:0,e:0}; this.R={y:0,v:0,e:0};
    }
    process(_, outputs, p){
      const out=outputs[0][0], f=p.firing[0], load=p.load[0], dt=1/sampleRate, cyc=f/8;
      const wL=6.2832*(52+f*0.8), wR=6.2832*(66+f*0.95), zt=0.055+0.03*load;
      const kick=0.3+0.6*load, eDec=Math.exp(-dt/0.009), nk=1-Math.exp(-dt*6.2832*(320+f*3));
      const L=this.L, R=this.R;
      for(let i=0;i<out.length;i++){
        let p2=this.ph+cyc*dt;
        for(const t of this.evL) if((t>=this.ph&&t<p2)||(p2>1&&t<p2-1)){ const a=kick*(0.8+0.4*Math.random()); L.v+=a*wL; L.e+=a; }
        for(const t of this.evR) if((t>=this.ph&&t<p2)||(p2>1&&t<p2-1)){ const a=kick*(0.8+0.4*Math.random()); R.v+=a*wR; R.e+=a; }
        this.ph = p2>=1 ? p2-1 : p2;
        L.v+=(-wL*wL*L.y-2*zt*wL*L.v)*dt; L.y+=L.v*dt;   // per-bank damped exhaust resonators
        R.v+=(-wR*wR*R.y-2*zt*wR*R.v)*dt; R.y+=R.v*dt;
        this.lpn+=((Math.random()*2-1)-this.lpn)*nk;      // combustion noise, lowpassed,
        const nz=this.lpn*(L.e+R.e); L.e*=eDec; R.e*=eDec; // gated by the firing bursts
        this.sub+=6.2832*f*dt; if(this.sub>6.2832)this.sub-=6.2832;
        const s=(L.y+R.y)*1.5 + nz*0.7 + Math.sin(this.sub)*(0.22+0.3*load);
        out[i]=Math.tanh(s*(1.15+0.85*load));             // soft-clip: load adds grit
      }
      return true;
    }
  });`;
  let engine=null, engineBooting=false, skid=null;
  function ensureEngine(){
    if(engine||engineBooting) return;
    try{
      actx = actx || new (window.AudioContext||window.webkitAudioContext)();
      if(actx.state==="suspended") actx.resume();
      if(!skid) skid=buildSkid();
      if(actx.audioWorklet && window.AudioWorkletNode){
        engineBooting=true;
        const url=URL.createObjectURL(new Blob([V8_SRC],{type:"application/javascript"}));
        actx.audioWorklet.addModule(url).then(()=>{
          const node=new AudioWorkletNode(actx,"v8-rumble",{numberOfInputs:0,outputChannelCount:[1]});
          const lp=actx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=230; lp.Q.value=0.5;
          const master=actx.createGain(); master.gain.value=0;
          node.connect(lp); lp.connect(master); master.connect(actx.destination);
          engine={worklet:true,node,lp,master,pF:node.parameters.get("firing"),pL:node.parameters.get("load")};
        }).catch(()=>{ engine=buildOscEngine(); }).finally(()=>{ engineBooting=false; });
      } else engine=buildOscEngine();
    }catch(e){ engine=null; engineBooting=false; }
  }
  // fallback synth (pre-worklet browsers): RPM-driven harmonics + noise through a shaper
  function buildOscEngine(){
    try{
      const master=actx.createGain(); master.gain.value=0.0; master.connect(actx.destination);
      // master LOWPASS: kills the sharp-edge crackle (low-freq saw/square click on
      // every cycle) and the screaming highs from the shaper -> leaves a deep rumble.
      const lp=actx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=180; lp.Q.value=0.4; lp.connect(master);
      // gentle waveshaper for grit (tamed by the lowpass downstream)
      const shaper=actx.createWaveShaper(); shaper.oversample="4x";
      { const n=1024, c=new Float32Array(n), k=2.2; for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(k*x); } shaper.curve=c; }
      shaper.connect(lp);
      // V8 lope: a smooth (triangle) LFO at the firing rate gently pulses the bus.
      // bus level kept low so the summed signal never exceeds the shaper's [-1,1]
      // input (past that a WaveShaper hard-clips flat = crackle); it just gently saturates.
      const bus=actx.createGain(); bus.gain.value=0.42; bus.connect(shaper);
      const lfo=actx.createOscillator(); lfo.type="triangle"; lfo.frequency.value=24;
      const lfoGain=actx.createGain(); lfoGain.gain.value=0.30; lfo.connect(lfoGain); lfoGain.connect(bus.gain); lfo.start();
      // sub-octave (sine) + fundamental + harmonics; the lowpass downstream removes
      // the clicky high-frequency edges, so these become a smooth low rumble.
      const oscs=[0.5,1,2,3].map((mult,i)=>{
        const o=actx.createOscillator(); o.type=["sine","sawtooth","sawtooth","triangle"][i]; o.frequency.value=20*mult;
        const g=actx.createGain(); g.gain.value=[0.66,0.34,0.08,0.02][i];   // low-weighted: heavy sub + fundamental, less upper buzz
        o.connect(g); g.connect(bus); o.start(); return {o,mult};
      });
      // low combustion-noise rumble bed (~half the feel per the talk)
      const buf=actx.createBuffer(1,actx.sampleRate,actx.sampleRate), d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
      const noise=actx.createBufferSource(); noise.buffer=buf; noise.loop=true;
      const nf=actx.createBiquadFilter(); nf.type="lowpass"; nf.frequency.value=85; nf.Q.value=0.7;
      const ng=actx.createGain(); ng.gain.value=0.0;
      noise.connect(nf); nf.connect(ng); ng.connect(bus); noise.start();
      return {master,oscs,nf,ng,lfo,lp};
    }catch(e){ return null; }
  }
  function updateEngine(speed, throttleAmt){
    if(!engine||!actx) return;
    const t=actx.currentTime, sp=Math.abs(speed), load=Math.min(1,Math.abs(throttleAmt)), rev=Math.min(1,sp/MAX_SPEED);
    if(engine.worklet){
      // huge lazy V8: firing ~24Hz at idle, ~95Hz flat out. load fattens every pulse
      // (kick + grit + sub) and speed opens the exhaust lowpass a touch.
      engine.pF.setTargetAtTime(24 + Math.sqrt(sp)*2.1 + load*6, t, 0.06);
      engine.pL.setTargetAtTime(Math.min(1, 0.75*load + 0.3*rev), t, 0.09);
      engine.lp.frequency.setTargetAtTime(230 + sp*0.85, t, 0.08);
      engine.master.gain.setTargetAtTime(0.22*(0.45+0.55*rev+0.4*load), t, 0.08);
      return;
    }
    // firing frequency tuned so the harmonics land in the audible rumble band
    const f0=20 + Math.sqrt(sp)*1.5 + load*5;            // idle ~20Hz, max ~41Hz — deeper still
    for(const {o,mult} of engine.oscs) o.frequency.setTargetAtTime(f0*mult, t, 0.06);
    engine.lfo.frequency.setTargetAtTime(Math.max(6, f0*0.45), t, 0.05);  // slow V8 lope = throbbier rumble
    engine.lp.frequency.setTargetAtTime(175 + sp*0.9, t, 0.08);           // darker: cuts high buzz, leaves low rumble
    engine.nf.frequency.setTargetAtTime(85 + sp*0.5, t, 0.06);
    engine.ng.gain.setTargetAtTime(0.28*(0.5+0.5*load), t, 0.08);         // a touch more low combustion rumble
    engine.master.gain.setTargetAtTime(0.11*(0.45+0.55*rev+0.4*load), t, 0.08);
  }

  // ---- tire skid: noise through two resonant bandpasses (the tonal squeal, pitch
  //      wobbled by an LFO so it never whistles steadily) plus a broadband scrub bed.
  //      Squeal frequency chirps DOWN as the car slows — the classic brake-stop arc. ----
  function buildSkid(){
    try{
      const buf=actx.createBuffer(1, actx.sampleRate*2, actx.sampleRate), d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
      const src=actx.createBufferSource(); src.buffer=buf; src.loop=true;
      const master=actx.createGain(); master.gain.value=0; master.connect(actx.destination);
      const mk=(type,f,q,g)=>{ const b=actx.createBiquadFilter(); b.type=type; b.frequency.value=f; b.Q.value=q;
        const gn=actx.createGain(); gn.gain.value=g; src.connect(b); b.connect(gn); gn.connect(master); return b; };
      const bp1=mk("bandpass", 1100, 9, 3.0);    // squeal fundamental
      const bp2=mk("bandpass", 1600, 11, 2.0);   // squeal overtone
      mk("bandpass", 420, 0.8, 1.1);             // rubber-scrub roar under it
      const lfo=actx.createOscillator(); lfo.type="sine"; lfo.frequency.value=6.5;
      const lg=actx.createGain(); lg.gain.value=70; lfo.connect(lg); lg.connect(bp1.frequency); lg.connect(bp2.frequency);
      src.start(); lfo.start();
      return {master,bp1,bp2};
    }catch(e){ return null; }
  }
  function updateSkid(lvl, sp){
    if(!skid||!actx) return;
    const t=actx.currentTime;
    const f=800 + Math.min(700, sp*2.2);                       // squeal pitch rides speed -> chirps down while stopping
    skid.bp1.frequency.setTargetAtTime(f, t, 0.06);
    skid.bp2.frequency.setTargetAtTime(f*1.45, t, 0.06);
    skid.master.gain.setTargetAtTime(lvl>0.02 ? 0.3*lvl : 0, t, lvl>0.02 ? 0.03 : 0.09);   // snap on, trail off
  }

  // ---- input ----
  const keys = new Set();
  const isFwd =()=>keys.has("ArrowUp")||keys.has("e")||keys.has("i");
  const isRev =()=>keys.has("ArrowDown")||keys.has("d")||keys.has("k");
  const isLeft=()=>keys.has("ArrowLeft")||keys.has("s")||keys.has("j");
  const isRight=()=>keys.has("ArrowRight")||keys.has("f")||keys.has("l");
  const isBrake=()=>keys.has("Control");                         // Ctrl = brakes
  const isHand =()=>keys.has("Shift");                           // Shift = handbrake (drift initiator)
  const MOVE=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","e","s","d","f","i","j","k","l","Control","Shift"];
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
    if(!st || document.body.classList.contains("touch")) return;   // touch UI owns steering on phones
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
    if(document.body.classList.contains("touch")) return; // no pointer-lock on touch devices
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

  // ---- touch controls (phone): a steering bar/zone along the bottom-left, and a
  //      vertical acc/rev slider on the right. Two thumbs work independently. ----
  let touchThr = 0;                                  // -1 (full reverse) .. +1 (full forward)
  let touchBrake = false;                            // hold-to-brake button (touch only)
  function enableTouchUI(){ document.body.classList.add("touch"); }
  if(window.matchMedia && matchMedia("(pointer: coarse)").matches) enableTouchUI();   // phones/tablets
  addEventListener("touchstart", ()=>{ enableTouchUI(); ensureEngine(); }, {passive:true});

  const steerZone=$("touchSteer"), thrZone=$("touchThrottle");
  function steerFromTouch(t){
    if(!st) return;
    const r=steerZone.getBoundingClientRect();
    const frac=clamp((t.clientX-r.left)/r.width*2-1,-1,1);
    const m=Math.pow(Math.abs(frac),1.4);            // ease the centre, no deadband — matches the mouse bar
    st.delta=Math.sign(frac)*m*MAX_STEER;
    mouseSteer=true;                                 // touch owns the wheel (suppress keyboard centre-snap)
  }
  function thrFromTouch(t){
    const r=thrZone.getBoundingClientRect();
    const f=clamp((r.top+r.height/2-t.clientY)/(r.height/2),-1,1);   // up = forward, down = reverse
    const dead=0.08;                                 // small neutral band around centre
    touchThr = Math.abs(f)<dead ? 0 : (f-Math.sign(f)*dead)/(1-dead);
  }
  function bindZone(el,onMove,onEnd){
    const move=e=>{ if(e.targetTouches.length) onMove(e.targetTouches[0]); e.preventDefault(); };
    const end =e=>{ if(e.targetTouches.length===0 && onEnd) onEnd(); e.preventDefault(); };
    el.addEventListener("touchstart",e=>{ enableTouchUI(); ensureEngine(); if(e.targetTouches.length) onMove(e.targetTouches[0]); e.preventDefault(); },{passive:false});
    el.addEventListener("touchmove",move,{passive:false});
    el.addEventListener("touchend",end,{passive:false});
    el.addEventListener("touchcancel",end,{passive:false});
  }
  bindZone(steerZone, steerFromTouch, null);                  // steering set-and-holds (like the mouse bar)
  bindZone(thrZone,   thrFromTouch,  ()=>{ touchThr=0; });    // release the throttle -> neutral (coast)

  // brake: a momentary hold button (touch's equivalent of Ctrl)
  const brakeZone=$("touchBrake");
  function setBrake(on){ touchBrake=on; brakeZone.classList.toggle("pressed",on); }
  brakeZone.addEventListener("touchstart",e=>{ enableTouchUI(); ensureEngine(); setBrake(true); e.preventDefault(); },{passive:false});
  brakeZone.addEventListener("touchend",e=>{ setBrake(false); e.preventDefault(); },{passive:false});
  brakeZone.addEventListener("touchcancel",e=>{ setBrake(false); e.preventDefault(); },{passive:false});

  function bayDims(b){ const d=BAY[b.fit]; return {hl:b.hl||d.hl, hw:b.hw||d.hw}; }

  // ---- snapshots for rewind ----
  function snapshot(){ return {x:st.x,y:st.y,theta:st.theta,phi:st.phi,delta:st.delta,
    v:st.v,vlat:st.vlat,om:st.omega,omT:st.omegaT,
    camx:cam.x,camy:cam.y,camrot:camRot,
    tf:trails.front.length,tr:trails.rear.length,tt:trails.trailer.length}; }
  function restore(s){
    // full state restore: pose, steering, velocity AND camera all captured from the buffered moment
    st.x=s.x; st.y=s.y; st.theta=s.theta; st.phi=s.phi; st.delta=s.delta;
    st.v=s.v; st.vlat=s.vlat; st.omega=s.om; st.omegaT=s.omT;
    st.FyT=0; st._hFx=0; st._hFy=0; st._pVhx=st._pVhy=null;   // drop coupling state — the finite-diff pivot accel must not see the teleport
    cam={x:s.camx, y:s.camy}; camRot=s.camrot; camSnap=true;   // restore + insta-snap the camera (no animation)
    trails.front.length=Math.min(trails.front.length,s.tf);
    trails.rear.length =Math.min(trails.rear.length, s.tr);
    trails.trailer.length=Math.min(trails.trailer.length,s.tt);
  }

  function loadLevel(i){
    levelIdx=i; level=LEVELS[i];
    const s=level.start;
    st={x:s.x,y:s.y,theta:s.th,phi:s.th,delta:0,v:0,vlat:0,omega:0,omegaT:0,FyT:0,
        _hFx:0,_hFy:0,_pVhx:null,_pVhy:null,
        pitch:0,pitchV:0,roll:0,rollV:0,trRoll:0,trRollV:0};
    const pb = level.perturb ?? PERTURB;
    if(pb>0){ const sgn=Math.random()<0.5?-1:1; st.phi = s.th + sgn*(pb + Math.random()*PERTURB_RAND); }
    if(level.lateral){ const sgn=Math.random()<0.5?-1:1, d=sgn*level.lateral*(0.55+Math.random()*0.45);
      st.x += -Math.sin(s.th)*d; st.y += Math.cos(s.th)*d; }
    holdT=0; levelDone=false; hitWall=false; hitCone=false; inPosition=false; fitNow=false;
    runPath=0; runTime=0; runMoving=false; myEntry=null;
    dead=false; deadT=0; sampleT=0; bayGlowCur=0;
    trails.front.length=trails.rear.length=trails.trailer.length=0;
    cam={x:s.x,y:s.y}; camRot = -Math.PI/2 - st.theta; camSnap=true;
    snaps=[snapshot()];   // always have at least one fallback
    currState=prevState=captureState(); acc=0; teleported=false;   // reset interpolation

    // build the 3D scene for this level
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
  // 0..1 progress of the target sitting in the bay — drives the gradual amber->green
  // bay glow. Smooth: each corner ramps up as it crosses the edge into the bay.
  function bayFitGlow(){
    if(!level.bay) return 0;
    if(levelDone) return 1;
    const d=bayDims(level.bay), bay={cx:level.bay.x,cy:level.bay.y,ang:level.bay.ang,hl:d.hl,hw:d.hw};
    const prog = box => { let sum=0;
      for(const p of corners(box)){ const dx=p[0]-bay.cx,dy=p[1]-bay.cy,c=Math.cos(bay.ang),s=Math.sin(bay.ang);
        const lx=dx*c+dy*s, ly=-dx*s+dy*c;
        sum += clamp(Math.min((bay.hl+3)-Math.abs(lx),(bay.hw+3)-Math.abs(ly))/12, 0, 1); }
      return sum/4; };
    if(level.bay.fit==="car") return prog(carBox());
    if(level.bay.fit==="rig") return Math.min(prog(carBox()),prog(trailerBox()));
    return prog(trailerBox());
  }

  function triggerDead(kind){
    dead=true; deadT=0; st.v=0;
    deadDur = DEAD_TIME + (Math.random()*2-1)*DEAD_JITTER;   // small per-death wobble on the reset timing
    $("deadBig").textContent = kind==="wall" ? "Crunch!" : kind==="cone" ? "Cone down!" : "Jackknifed";
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
    if(dead){ deadT+=dt; if(deadT>=deadDur) respawn(); return; }

    // longitudinal + lateral dynamics are integrated in the substep loop below.
    // throttle/reverse come from the keyboard booleans OR the analog touch slider (touchThr).
    const throttle = clamp((isFwd()?1:0) + Math.max(0, touchThr), 0, 1);
    const reverse  = clamp((isRev()?1:0) + Math.max(0,-touchThr), 0, 1);
    const braking  = (isBrake()||touchBrake)?1:0;
    const hb       = isHand()?1:0;
    const v0 = st.v, om0 = st.omega, omT0 = st.omegaT;   // pre-step velocities -> body-attitude accel

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

    // dynamic single-track CAR pulling a KINEMATIC (no-slip) trailer. The car has
    // dynamic tyres; the trailer wheel can't slip sideways, so its angle is driven
    // purely by the hitch motion — it tracks cleanly at any speed (no low-speed pivot/
    // slide), and reverse is naturally unstable (fold past JACK_TRIGGER -> jackknife).
    const nsub=Math.max(1,Math.ceil(dt/(1/240))), h=dt/nsub;
    const d = LR + hitchC;                                  // COG -> hitch distance
    for(let i=0;i<nsub;i++){
      const cth=Math.cos(st.theta), sth=Math.sin(st.theta);
      let u=st.v, w=st.vlat, om=st.omega;
      let cogx = st.x + LR*cth, cogy = st.y + LR*sth;        // COG = rear axle + LR forward

      // --- trailer: kinematic no-slip constraint (wheel can't move sideways) ---
      const cph=Math.cos(st.phi), sph=Math.sin(st.phi);
      const cogvx0=u*cth - w*sth, cogvy0=u*sth + w*cth;      // COG world velocity (start)
      const Vhx = cogvx0 + om*d*sth, Vhy = cogvy0 - om*d*cth; // hitch world velocity
      const omegaTkin = (Vhy*cph - Vhx*sph)/draw_d;          // lateral hitch vel / draw_d -> trailer yaw rate
      // trailer -> car feedback: the full hitch PIN reaction (st._hFx/_hFy, trailer frame,
      // one substep old) — tyre force PLUS the inertial reaction of the swinging trailer
      // mass. Rotated into the car frame, applied at the hitch: force + yaw torque (lever
      // d). Zero whenever the drift gate is closed, so low speed / reverse feel nothing.
      const cArt = cth*cph + sth*sph, sArt = sth*cph - cth*sph;   // cos/sin(theta - phi)
      const yankBX =  cArt*st._hFx + sArt*st._hFy;
      const yankBY = -sArt*st._hFx + cArt*st._hFy;
      const yankTau = -d*yankBY;

      // --- car longitudinal + lateral tyres ---
      let Fx = throttle*DRIVE - reverse*REV;
      Fx -= braking*BRAKE*Math.tanh(u*0.4);                 // brake opposes forward motion
      Fx -= DRAG_L*u + ROLL_L*Math.tanh(u*3);               // viscous + coulomb resistance
      // handbrake: fades in above parking speeds, drags the rear + guts rear grip below
      const hbG = hb*clamp((u - 60)/90, 0, 1);
      Fx -= hbG*HB_BRAKE*Math.tanh(u*0.4);
      const sp = Math.hypot(u,w), den = Math.max(sp,3), su = u>=0?1:-1;
      const latFade = Math.min(1, sp/1.2);                  // grip engages just off standstill -> crisp low-speed tracking (only true crawl fades, to avoid jitter)
      // speed-sensitive steering: ~full angle while parking, eased toward STEER_LO at speed.
      // the front acts on this reduced angle -> it bites less and washes wide (understeer).
      const dEff = st.delta*(STEER_LO + (1-STEER_LO)/(1 + (sp/STEER_REF)*(sp/STEER_REF)));
      const af = Math.atan2(w + LF*om, den) - dEff*su;
      const ar = Math.atan2(w - LR*om, den);
      const tract = throttle*DRIVE + braking*BRAKE + reverse*REV;
      const gl = Math.min(1, tract*REAR_LONG/GRIP_R);       // RWD friction circle: drive/brake eats rear grip
      const grR = GRIP_R*Math.sqrt(Math.max(0.15, 1 - gl*gl))*(1 - HB_GRIP*hbG);
      const Fyf = -GRIP_F*latFade*Math.tanh(KSTIFF*af);
      const Fyr = -grR   *latFade*Math.tanh(KSTIFF*ar);

      const ax = Fx - Fyf*Math.sin(dEff) + w*om + yankBX;
      const ay = Fyf*Math.cos(dEff) + Fyr - u*om + yankBY;
      const omdot = (LF*Fyf*Math.cos(dEff) - LR*Fyr + yankTau)/IZ - YAW_DAMP*(1 - 0.6*hbG)*om;   // handbrake frees the car to rotate
      u = clamp(u + ax*h, -MAX_SPEED, MAX_SPEED);
      w += ay*h; om += omdot*h;

      st.theta += om*h;
      const c2=Math.cos(st.theta), s2=Math.sin(st.theta);
      const wvx = u*c2 - w*s2, wvy = u*s2 + w*c2;
      cogx += wvx*h; cogy += wvy*h;
      st.v=u; st.vlat=w; st.omega=om;
      st.x = cogx - LR*c2; st.y = cogy - LR*s2;             // back to rear-axle reference

      // --- integrate the trailer: no-slip roll at low speed / any reverse (slideGate 0 ->
      // omegaT === omegaTkin, byte-identical to before). At forward speed it becomes a
      // swinging MASS: rotation about the hitch is a DRIVEN PENDULUM — the pivot's lateral
      // acceleration (finite-differenced hitch velocity) slings the trailer out (the
      // flick), while a SATURATING tyre at the axle (plateaus past ~1/TR_KSTIFF rad,
      // never collapses) pulls it back toward rolling true, so swings are catchable.
      // The full pin reaction (tyre + swinging-mass inertia) is stored in trailer-frame
      // components for the car to feel next substep. ---
      let omegaT = omegaTkin, slipAng = 0;
      const sg = clamp((u - TR_SLIDE_LO)/(TR_SLIDE_HI - TR_SLIDE_LO), 0, 1), slideGate = sg*sg*(3-2*sg);
      if(slideGate > 0){
        const Vt = Math.max(Math.hypot(Vhx, Vhy), 1);
        slipAng = (omegaTkin - st.omegaT)*draw_d/Vt;           // axle slip angle (from the trailer's own yaw rate)
        const x = TR_KSTIFF*slipAng;
        const FyTarget = TR_GRIP_D * x/Math.sqrt(1 + x*x);     // saturating tyre force
        st.FyT += (FyTarget - st.FyT)*Math.min(1, Vt*h/TR_RELAX_D);
        // pivot (hitch) acceleration on trailer axes; _pVh nulled across teleports
        const ok = st._pVhx !== null;
        const aHx = ok ? clamp((Vhx - st._pVhx)/h, -4000, 4000) : 0;
        const aHy = ok ? clamp((Vhy - st._pVhy)/h, -4000, 4000) : 0;
        const aHt = aHx*cph + aHy*sph, aHl = -aHx*sph + aHy*cph;
        // pendulum about the pin: pivot yank slings the load out; tyre torque restores;
        // scrub damping bleeds swing energy so a max-effort flick stays this side of the jackknife
        const omdT = (TR_MASS*TR_COG*aHl + draw_d*st.FyT)/TR_IZD - SWAY_DAMP*(st.omegaT - omegaTkin);
        const omegaDyn = clamp(st.omegaT + omdT*h, -8, 8);
        // partial gate bleeds the dynamic state toward kinematic at a RATE that vanishes
        // at full gate (re-anchoring the state each substep would annihilate any swing)
        omegaT = omegaTkin + (omegaDyn - omegaTkin)*Math.exp(-(1-slideGate)*25*h);
        // pin reaction on the car, trailer frame (-st.FyT is the physical tyre force on
        // the trailer; the rest is the inertial reaction of the swinging mass)
        st._hFx = clamp(slideGate*(-TR_MASS*(aHt + TR_COG*st.omegaT*st.omegaT)), -PIN_CAP, PIN_CAP);
        st._hFy = clamp(slideGate*(-st.FyT - TR_MASS*(aHl - TR_COG*omdT)), -PIN_CAP, PIN_CAP);
      } else { st.FyT = 0; st._hFx = 0; st._hFy = 0; }
      st._pVhx = Vhx; st._pVhy = Vhy;
      st.omegaT = omegaT;
      st.phi += st.omegaT*h;
      st._aT = Math.abs(slipAng)*slideGate;                    // slip angle -> trailer skidmarks once it breaks loose
      const rel=norm(st.theta-st.phi);
      if(rel> MAX_ARTIC){ st.phi=st.theta-MAX_ARTIC; st.omegaT=om; }
      if(rel<-MAX_ARTIC){ st.phi=st.theta+MAX_ARTIC; st.omegaT=om; }

      st._ar=Math.abs(ar); st._gl=gl;                  // car slip metrics for skidmarks (st._aT set in the trailer block)
    }

    // --- body dynamics (cosmetic): drive a sprung-mass spring-damper from the accelerations ---
    // longitudinal accel from the velocity change this tick; lateral accel ~ centripetal (v*yaw).
    const aLong  = (st.v - v0)/dt;
    const aLatC  = st.v*st.omega + (st.omega-om0)/dt*LR;          // car body lateral accel (centripetal + yaw transient)
    const aLatT  = st.v*st.omegaT + (st.omegaT-omT0)/dt*draw_d*0.5;// trailer lateral accel about its axle
    const spring = (ang,vel,target,k,d)=>{ const a=k*(target-ang)-d*vel; return [ang+vel*dt, vel+a*dt]; };
    // car: forward accel lifts the nose (squat), braking dives it; lateral accel leans it out of the turn
    [st.pitch, st.pitchV] = spring(st.pitch, st.pitchV, clamp( aLong *PITCH_GAIN, -PITCH_MAX, PITCH_MAX), SUS_K, SUS_D);
    [st.roll,  st.rollV ] = spring(st.roll,  st.rollV,  clamp(-aLatC *ROLL_GAIN,  -ROLL_MAX,  ROLL_MAX ), SUS_K, SUS_D);
    // trailer: cornering lean only (its pitch is geometric — derived from the hitch in the renderer)
    [st.trRoll,  st.trRollV ] = spring(st.trRoll,  st.trRollV,  clamp(-aLatT *TR_ROLL_GAIN,  -TR_ROLL_MAX,  TR_ROLL_MAX ), TR_SUS_K, TR_SUS_D);

    // jackknife -> game over: folding past the trigger angle ends the run (rewind)
    if(Math.abs(norm(st.theta - st.phi)) >= JACK_TRIGGER){ triggerDead("jackknife"); return; }

    // highscore tracking: rear-axle distance (integral of |v|), and time from first motion until cleared
    if(level.id!=="free" && !levelDone){
      runPath += Math.abs(st.v)*dt;
      if(!runMoving && Math.abs(st.v)>2) runMoving=true;
      if(runMoving) runTime += dt;
    }

    // collisions + fit
    const cb=carBox(), tb=trailerBox();
    hitWall=false; hitCone=false;
    for(const o of level.obstacles){
      if(o.t==="cone"){
        if(circleHitsBox(o.x,o.y,(o.r||10)+1,cb)||circleHitsBox(o.x,o.y,(o.r||10)+1,tb)) hitCone=true;
      }
      else if(o.t==="wall"){ const ob={cx:o.x,cy:o.y,ang:o.ang,hl:o.hl,hw:o.hw}; if(boxesOverlap(ob,cb)||boxesOverlap(ob,tb)) hitWall=true; }
      else if(regionHit(o,cb)||regionHit(o,tb)) hitWall=true;
    }

    // clip a cone or hit a wall -> rewind (a jackknife is caught above, before collisions run).
    if(hitCone){ clack(); triggerDead("cone"); return; }
    if(hitWall){ triggerDead("wall"); return; }

    fitNow=checkFit(cb,tb);
    inPosition = fitNow && Math.abs(st.v)<5;
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
    const entry={name:"", dist:runPath, time:runTime};
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
    $("bannerSub").textContent = `distance ${Math.round(runPath)} \u00b7 ${runTime.toFixed(1)}s${tag}`;
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
    if(rotateFollow){
      // focus a bit behind the car, led slightly by the actual velocity (incl. slides)
      // so the camera drifts with the motion instead of being rigidly bolted on
      const bk=112;                                       // focus back near the trailer -> camera sits further behind it
      const wvx = st.v*Math.cos(rs.theta) - st.vlat*Math.sin(rs.theta);
      const wvy = st.v*Math.sin(rs.theta) + st.vlat*Math.cos(rs.theta);
      tx = rs.x - bk*Math.cos(rs.theta) + wvx*0.08;
      ty = rs.y - bk*Math.sin(rs.theta) + wvy*0.08;
    } else { tx=(frontX+trAxX)/2; ty=(frontY+trAxY)/2; }
    // when driving forward, ease the camera's aim up/ahead so it looks where you're going.
    // a Hill curve v^2/(v^2+K^2) tracks speed across the whole range with flat asymptotes at
    // both ends: ~no look while crawling, gradually leaning in, saturating near top speed.
    const fv = Math.max(0, st.v), LOOK_K = 420;
    const lookTarget = rotateFollow ? (fv*fv)/(fv*fv + LOOK_K*LOOK_K) : 0;
    if(camSnap){                                           // after a reset / level load: insta-pop, no follow animation
      cam.x=tx; cam.y=ty; if(rotateFollow) camRot=-Math.PI/2-rs.theta; camLook=lookTarget; camSnap=false;
    } else {
      cam.x+=(tx-cam.x)*0.07; cam.y+=(ty-cam.y)*0.07;      // looser follow -> the rig moves within the frame
      if(rotateFollow) camRot += norm((-Math.PI/2 - rs.theta) - camRot)*0.048;  // rotation lags -> car visibly turns/slides in frame
      camLook += (lookTarget - camLook)*0.05;              // ease the look-ahead (slower than position so it feels weighty)
    }

    // trails: sample the interpolated wheel positions
    if(trailsOn && !dead){ pushTrail(trails.front,frontX,frontY); pushTrail(trails.rear,rs.x,rs.y); pushTrail(trails.trailer,trAxX,trAxY); }

    // hand the interpolated pose + view state to the 3D renderer
    bayGlowCur += (bayFitGlow() - bayGlowCur) * 0.12;     // ease, then interpolate the glow colour in OKLab
    R.update(
      {x:rs.x, y:rs.y, theta:rs.theta, phi:rs.phi, delta:rs.delta, v:rs.v,
       pitch:rs.pitch, roll:rs.roll, trRoll:rs.trRoll},
      {camX:cam.x, camY:cam.y, camRot, camLook, rotateFollow, bayColor:bayColorAt(bayGlowCur), bayEdge:bayEdgeAt(bayGlowCur), trails, trailsOn, dead}
    );

    // skidmarks: lay rubber at the rear wheels when the tail slips/spins, and at the
    // trailer wheels when it fishtails. (lateral dir = (-s,c) for car, (-sp,cp) for trailer)
    const htC=carTrack/2, htT=trailerTrack/2;
    const fastSkid = Math.abs(st.v) > 30;    // skids are a speed phenomenon — slow parking never marks the tarmac
    const rearSkid  = !dead && fastSkid && (st._ar>0.3 || st._gl>0.8);
    const trailSkid = !dead && fastSkid && st._aT>0.2;   // st._aT is slip ANGLE now -> only marks once it's actually sliding (past ~breakaway)
    R.updateSkids([
      {key:'rl', x:rs.x - s*htC,  y:rs.y + c*htC,  on:rearSkid},
      {key:'rr', x:rs.x + s*htC,  y:rs.y - c*htC,  on:rearSkid},
      {key:'tl', x:trAxX - sp*htT, y:trAxY + cp*htT, on:trailSkid},
      {key:'tr', x:trAxX + sp*htT, y:trAxY - cp*htT, on:trailSkid},
    ]);

    // off-screen goal arrow: aim toward the bay with a view-space direction (correct
    // even when the bay is behind the camera), then clamp to the screen-edge rectangle.
    const ga=$("goalArrow");
    if(level.bay){
      const a=R.aim(level.bay.x, level.bay.y);
      if(a.onscreen) ga.style.display="none";
      else {
        const cw=glCanvas.clientWidth, ch=glCanvas.clientHeight;
        let dx=a.dirx, dy=a.diry;
        if(Math.abs(dx)<1e-6 && Math.abs(dy)<1e-6) dy=1;     // degenerate (dead behind) -> point down
        // clamp the arrow to a rectangle inset from the HUD chrome (steer bar / touch
        // controls / status pill) so it sits well inside the view instead of hiding behind it.
        const touch=document.body.classList.contains("touch");
        const insT = touch ? 58 : 82;                        // top: status (mobile) / steer bar (desktop)
        const insL = 46, insR = 46;
        let insB = 56;                                       // bottom: status + lock hint (desktop)
        if(touch){ const ts=$("touchSteer"); insB = (ts?ts.getBoundingClientRect().height:170) + 22; }   // clear the touch controls
        const left=insL, right=Math.max(insL+80, cw-insR);
        const top=insT, bottom=Math.max(insT+80, ch-insB);
        const cxp=(left+right)/2, cyp=(top+bottom)/2, hxp=(right-left)/2, hyp=(bottom-top)/2;
        const sc=Math.min(hxp/Math.abs(dx||1e-6), hyp/Math.abs(dy||1e-6));
        ga.style.transform=`translate(${cxp+dx*sc-17}px,${cyp+dy*sc-17}px) rotate(${Math.atan2(dy,dx)}rad)`;
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
    const tgt=clamp((isFwd()?1:0)-(isRev()?1:0)+touchThr,-1,1);
    const rate = (Math.abs(tgt) > Math.abs(thrDisp) || (tgt!==0 && Math.sign(tgt)!==Math.sign(thrDisp))) ? 0.05 : 0.022;
    thrDisp += (tgt-thrDisp)*rate;
    if(Math.abs(thrDisp)<0.002) thrDisp=0;
    const tf=$("thrFill");
    if(thrDisp>=0){ tf.style.top=(50-50*thrDisp)+"%"; tf.style.height=(50*thrDisp)+"%"; tf.style.background="var(--good)"; }
    else { tf.style.top="50%"; tf.style.height=(50*-thrDisp)+"%"; tf.style.background="var(--warn)"; }
    // the touch slider follows the finger EXACTLY (no smoothing) — fill + thumb track touchThr,
    // not the inertial thrDisp (that's just for the keyboard-driven sidebar gauge + engine sound)
    const ttf=$("ttFill"), ttt=$("ttThumb");
    if(touchThr>=0){ ttf.style.top=(50-50*touchThr)+"%"; ttf.style.height=(50*touchThr)+"%"; ttf.style.background="var(--good)"; }
    else { ttf.style.top="50%"; ttf.style.height=(50*-touchThr)+"%"; ttf.style.background="var(--warn)"; }
    ttt.style.top=(50-44*touchThr)+"%";

    updateEngine(st.v, thrDisp);
    // skid audio intensity: stomped brakes at speed are the headliner; lateral rear
    // slip, raw drift and trailer fishtail all scrub too. Take the loudest cause.
    const spd=Math.abs(st.v);
    const brkSk = (isBrake()||touchBrake) && spd>25 ? 0.4+Math.min(0.6, spd/300) : 0;
    const latSk = fastSkid && st._ar>0.25 ? Math.min(1, (st._ar-0.25)*2.5) : 0;
    const drfSk = fastSkid && Math.abs(st.vlat)>10 ? Math.min(0.6, (Math.abs(st.vlat)-10)/60) : 0;
    const trlSk = fastSkid && st._aT>0.15 ? Math.min(0.8, st._aT*1.4) : 0;
    updateSkid(dead ? 0 : Math.max(brkSk, latSk, drfSk, trlSk), spd);
    updateRunLine();
  }
  const fmtDist=d=>Math.round(d).toString();
  const fmtTime=t=>t.toFixed(1)+"s";
  function updateRunLine(){
    $("recRun").textContent = level.id==="free" ? "\u2014"
      : (fmtDist(runPath)+"  \u00b7  "+(runMoving?fmtTime(runTime):"0.0s"));
  }
  function renderBoard(elId, list, metric){
    const box=$(elId); box.replaceChildren();
    // show only each person's best run (list is sorted best-first, so keep the first per name)
    const seen=new Set(); list=(list||[]).filter(e=>!seen.has(e.name)&&seen.add(e.name));
    if(!list.length){ const d=document.createElement("div"); d.className="board-empty"; d.textContent="no entries yet"; box.appendChild(d); return; }
    list.forEach((e,i)=>{ const row=document.createElement("div"); row.className="brow"+(e===myEntry?" mine":"");
      const rank=document.createElement("span"); rank.className="br-rank"; rank.textContent=(i+1);
      const name=document.createElement("span"); name.className="br-name"; name.textContent=e.name;
      const val=document.createElement("span"); val.className="br-val"; val.textContent=metric==="dist"?fmtDist(e.dist):fmtTime(e.time);
      row.append(rank,name,val); box.appendChild(row); });
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
    $("nmSub").textContent = `You made ${where} — distance ${Math.round(runPath)}, time ${runTime.toFixed(1)}s.`;
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
    // one entry per person per board: replace their existing entry only if this run is better
    const upsert=(list,e,metric)=>{ const j=list.findIndex(x=>x.name===e.name);
      if(j>=0){ if(cmp(metric)(e,list[j])<0) list[j]=e; } else list.push(e);
      list.sort(cmp(metric)); if(list.length>LB_N) list.length=LB_N; };
    if(p.qd) upsert(p.lb.dist, p.entry, "dist");
    if(p.qt) upsert(p.lb.time, p.entry, "time");
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
      const id=LEVELS[i].id, tick=b.querySelector(".tick");
      if(completed.has(id)){ tick.textContent="\u2713"; tick.style.color="var(--good)"; }   // green check = cleared
      else { tick.textContent=""; } });
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
  function captureState(){ return {x:st.x,y:st.y,theta:st.theta,phi:st.phi,delta:st.delta,v:st.v,
    pitch:st.pitch,roll:st.roll,trRoll:st.trRoll}; }
  function lerpState(p,c,t){ return {
    x:lerpN(p.x,c.x,t), y:lerpN(p.y,c.y,t),
    theta:lerpAng(p.theta,c.theta,t), phi:lerpAng(p.phi,c.phi,t),
    delta:lerpN(p.delta,c.delta,t), v:c.v,
    pitch:lerpN(p.pitch,c.pitch,t), roll:lerpN(p.roll,c.roll,t),
    trRoll:lerpN(p.trRoll,c.trRoll,t) }; }

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
  window.__tt = () => ({ v:st.v, vlat:st.vlat, om:st.omega, omT:st.omegaT, delta:st.delta, artic:norm(st.theta-st.phi)*57.3, ar:st._ar, gl:st._gl, aT:st._aT, skids:R.skidCountDbg?R.skidCountDbg():-1,
    pitch:st.pitch*57.3, roll:st.roll*57.3, trRoll:st.trRoll*57.3 });
  window.__hitch = () => R.hitchDbg();   // coupling check: car-hitch vs trailer-tongue world gap
  window.__audio = () => ({ actx, engine, skid });   // sound probe (test scripts attach an analyser)
})();
