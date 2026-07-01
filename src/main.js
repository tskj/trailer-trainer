// Trailer Trainer client: renders the deterministic sim, records every run's
// tick inputs, and submits finished runs to the leaderboard server, which
// re-simulates them for verification. The flow is TrackMania-shaped: load in,
// drive, Space to grind retries, Enter to move on — no side panel, no modals.
import { createScene } from './render3d.js';
import { createSim, TICK, SIM_VERSION, MAX_STEER, G, JACK_TRIGGER,
         rowFromInput, inputFromRow, packTicks, clamp, norm } from './sim.js';
import { LEVELS } from './levels.js';
import * as audio from './audio.js';
import { fetchBoards, fetchSummary, submitRun } from './net.js';

(() => {
"use strict";

// ---- renderer ----
const glCanvas = document.getElementById("gl");
const R = createScene(glCanvas, G);
addEventListener("resize", () => R.resize());

// ---- client steering feel (keyboard): force + viscous drag + coulomb return.
//      Runs OUTSIDE the sim — the sim only ever sees the resulting wheel angle,
//      which is what gets recorded and replayed. ----
const STEER_FORCE=1.2, STEER_DRAG=1.6, STEER_ROLL=0.05;
const MAX_STEPS_PER_FRAME = 8;

// ---- persisted identity + local PBs ----
const LS_NAME='tt.name', LS_PBS='tt.pbs';
let name = null; try{ name = localStorage.getItem(LS_NAME); }catch(e){}
let pbs = {};    try{ pbs = JSON.parse(localStorage.getItem(LS_PBS)||'{}'); }catch(e){}
function savePbs(){ try{ localStorage.setItem(LS_PBS, JSON.stringify(pbs)); }catch(e){} }

// ---- game state ----
let levelIdx=1, level=LEVELS[1], sim=null, seed=0;
let rows=[], recording=false, feedQ=null;         // feedQ: debug/e2e injected input rows
let camRot=0, camLook=0, camSnap=false, rotateFollow=true, teleported=false, mouseSteer=false, locked=false;
let cam={x:0,y:0}, thrDisp=0, bayGlowCur=0, introFaded=false;
let deltaCur=0, touchThr=0, touchBrake=false;
const trails={front:[],rear:[],trailer:[]}; let trailsOn=false;
const TRAIL_MAX=700, TRAIL_MIN=3;
let nameGateOpen=false, lvselOpen=false, resultsOpen=false, lvSelIdx=1;
let summaryCache=null, summaryAt=0;

const $ = id => document.getElementById(id);
const fmtTime = ms => { const s=ms/1000; return s<60 ? s.toFixed(2)+'s'
  : `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`; };
const fmtDist = d => `${Math.round(d)}`;

// ---- inputs ----
const keys = new Set();
const isFwd =()=>keys.has("ArrowUp")||keys.has("e")||keys.has("i");
const isRev =()=>keys.has("ArrowDown")||keys.has("d")||keys.has("k");
const isLeft=()=>keys.has("ArrowLeft")||keys.has("s")||keys.has("j");
const isRight=()=>keys.has("ArrowRight")||keys.has("f")||keys.has("l");
const isBrake=()=>keys.has("Control");
const isHand =()=>keys.has("Shift");
const MOVE=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","e","s","d","f","i","j","k","l","Control","Shift"];

// ---- OKLab colour ramps (steer bar + bay glow) ----
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
const _bayLo=_rgbLab("#ffc233"), _bayHi=_rgbLab("#3fce6c");
function bayColorAt(t){ return _labRgb([0,1,2].map(i=>_bayLo[i]+(_bayHi[i]-_bayLo[i])*t)); }
const _beLo=_rgbLab("#ffb01a"), _beHi=_rgbLab("#1fbe54");
function bayEdgeAt(t){ return _labRgb([0,1,2].map(i=>_beLo[i]+(_beHi[i]-_beLo[i])*t)); }

// ---------------------------------------------------------------- level flow
function loadLevel(i, forcedSeed){
  levelIdx=i; level=LEVELS[i];
  seed = forcedSeed !== undefined ? (forcedSeed>>>0) : (Math.random()*4294967296)>>>0;
  sim = createSim(level, seed);
  rows=[]; feedQ=null; recording = level.id!=='free';
  deltaCur=0; thrDisp=0; bayGlowCur=0; keys.clear();
  trails.front.length=trails.rear.length=trails.trailer.length=0;
  cam={x:level.start.x, y:level.start.y}; camRot=-Math.PI/2-level.start.th; camSnap=true;
  currState=prevState=captureState(); acc=0; teleported=false;
  R.buildLevel(level, level.bay ? {hl:level.bay.hl, hw:level.bay.hw} : null);
  $("dead").classList.remove("show"); $("ring").classList.remove("on");
  $("results").classList.remove("show"); resultsOpen=false;
  showIntro();
}
const nextLevel = () => loadLevel((levelIdx+1)%LEVELS.length);

function showIntro(){
  introFaded=false;
  $("intro").classList.remove("faded");
  $("introName").textContent = level.name;
  $("introGoal").textContent = level.goal;
  const rec=$("introRec"); rec.textContent='';
  if(level.id!=='free'){
    const lid=level.id;
    fetchBoards(lid).then(b=>{
      if(lid!==level.id || !b) return;
      const t=b.time&&b.time[0], d=b.dist&&b.dist[0];
      rec.innerHTML = (t||d)
        ? `WR <b>${t?fmtTime(t.timeMs):'—'}</b> ${t?esc(t.name):''} · shortest <b>${d?fmtDist(d.dist):'—'}</b> ${d?esc(d.name):''}`
        : 'no records yet — set the first one';
    });
  }
  $("runHud").style.display = level.id==='free' ? 'none' : '';
}
function fadeIntro(){ if(!introFaded){ introFaded=true; $("intro").classList.add("faded"); } }
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------------------------------------------------------------- finish + submit
function renderBoard(elId, list, metric){
  const box=$(elId); box.replaceChildren();
  if(!list || !list.length){ const dv=document.createElement('div'); dv.className='board-empty';
    dv.textContent = list ? 'no entries yet' : 'no connection'; box.appendChild(dv); return; }
  list.slice(0,8).forEach((e,i)=>{
    const row=document.createElement('div'); row.className='brow'+(e.name===name?' mine':'');
    const rank=document.createElement('span'); rank.className='br-rank'; rank.textContent=e.rank??(i+1);
    const nm=document.createElement('span'); nm.className='br-name'; nm.textContent=e.name;
    const val=document.createElement('span'); val.className='br-val';
    val.textContent = metric==='time' ? fmtTime(e.timeMs) : fmtDist(e.dist);
    row.append(rank,nm,val); box.appendChild(row);
  });
}
async function finishRun(){
  audio.chime();
  resultsOpen=true;
  const m = sim.metrics();
  const pb = pbs[level.id] || (pbs[level.id]={});
  const pbT = !(pb.timeMs<=m.timeMs), pbD = !(pb.dist<=m.dist);
  if(pbT) pb.timeMs=m.timeMs; if(pbD) pb.dist=m.dist; savePbs();
  $("resTime").textContent=fmtTime(m.timeMs); $("resTime").classList.toggle('pb',pbT);
  $("resDist").textContent=fmtDist(m.dist);   $("resDist").classList.toggle('pb',pbD);
  $("resTimePB").textContent = pbT ? 'personal best' : '';
  $("resDistPB").textContent = pbD ? 'personal best' : '';
  renderBoard("boardTime", null); renderBoard("boardDist", null);
  $("results").classList.add("show");
  const stat=$("resStatus");
  stat.innerHTML = 'submitting run for verification…';
  const packed = packTicks(rows);
  const res = await submitRun({ level: level.id, name, seed, v: SIM_VERSION, ticks: packed, claim: m });
  if(res.ok){
    stat.innerHTML = `<span class="ok">✓ verified</span> · #${res.rankTime} fastest · #${res.rankDist} shortest`;
    renderBoard("boardTime", res.boards.time, 'time');
    renderBoard("boardDist", res.boards.dist, 'dist');
    summaryCache=null;
  } else if(res.rejected){
    stat.innerHTML = `<span class="bad">✗ not accepted (${esc(res.reason||'verification failed')})</span>`;
    const b = await fetchBoards(level.id); if(b){ renderBoard("boardTime",b.time,'time'); renderBoard("boardDist",b.dist,'dist'); }
  } else {
    stat.innerHTML = `<span class="bad">offline — run not submitted</span>`;
  }
}

// ---------------------------------------------------------------- overlays
function openNameGate(prefill){
  nameGateOpen=true; $("nameGate").classList.add("show");
  $("intro").style.visibility='hidden';
  const inp=$("ngInput"); inp.value=prefill||''; setTimeout(()=>{inp.focus(); inp.select();},30);
}
function confirmName(){
  const v=$("ngInput").value.trim().slice(0,14);
  if(!v){ $("ngInput").focus(); return; }
  name=v; try{ localStorage.setItem(LS_NAME,name); }catch(e){}
  nameGateOpen=false; $("nameGate").classList.remove("show");
  $("intro").style.visibility='';
  $("lvName").textContent=name;
  last=performance.now();   // don't count gate time against the accumulator
}

function openLvSel(){
  lvselOpen=true; lvSelIdx=levelIdx;
  buildLvRows();
  $("lvName").textContent=name||'?';
  $("lvsel").classList.add("show");
  if(!summaryCache || Date.now()-summaryAt>30000){
    fetchSummary().then(s=>{ if(s){ summaryCache=s; summaryAt=Date.now(); if(lvselOpen) buildLvRows(); } });
  }
}
function closeLvSel(){ lvselOpen=false; $("lvsel").classList.remove("show"); last=performance.now(); }
function buildLvRows(){
  const box=$("lvRows"); box.replaceChildren();
  LEVELS.forEach((lv,i)=>{
    const row=document.createElement('div'); row.className='lv-row'+(i===lvSelIdx?' sel':'');
    const n=document.createElement('span'); n.className='n'; n.textContent = i===0?'0':String(i);
    const nm=document.createElement('span'); nm.textContent=lv.name.replace(/^\d+ · /,'');
    const pb=document.createElement('span'); pb.className='pb';
    const p=pbs[lv.id];
    pb.textContent = lv.id==='free' ? '' : (p&&p.timeMs!=null ? `PB ${fmtTime(p.timeMs)} · ${fmtDist(p.dist)}` : '');
    const wr=document.createElement('span'); wr.className='wr';
    const s=summaryCache&&summaryCache.levels&&summaryCache.levels[lv.id];
    wr.textContent = lv.id==='free' ? '' : (s&&s.bestTime ? `WR ${fmtTime(s.bestTime.timeMs)} ${s.bestTime.name}` : '');
    row.append(n,nm,pb,wr);
    row.onclick=()=>{ closeLvSel(); loadLevel(i); };
    box.appendChild(row);
  });
}

// ---------------------------------------------------------------- keyboard
addEventListener("keydown", e=>{
  const k = e.key.length===1 ? e.key.toLowerCase() : e.key;
  // name gate: let the input receive text; only intercept Enter/Escape
  if(nameGateOpen){
    if(e.key==="Enter"){ confirmName(); e.preventDefault(); }
    else if(e.key==="Escape" && name){ nameGateOpen=false; $("nameGate").classList.remove("show"); $("intro").style.visibility=''; last=performance.now(); }
    return;
  }
  if(e.key==="Tab"){ e.preventDefault(); lvselOpen ? closeLvSel() : openLvSel(); return; }
  if(lvselOpen){
    if(e.key==="Escape"){ closeLvSel(); }
    else if(e.key==="ArrowUp"){ lvSelIdx=(lvSelIdx+LEVELS.length-1)%LEVELS.length; buildLvRows(); e.preventDefault(); }
    else if(e.key==="ArrowDown"){ lvSelIdx=(lvSelIdx+1)%LEVELS.length; buildLvRows(); e.preventDefault(); }
    else if(e.key==="Enter"){ const i=lvSelIdx; closeLvSel(); loadLevel(i); }
    else if(/^[0-9]$/.test(k)){ const i=parseInt(k,10); if(i<LEVELS.length){ closeLvSel(); loadLevel(i); } }
    return;
  }
  audio.ensureAudio();
  if(k===" "||k==="r"){ loadLevel(levelIdx); e.preventDefault(); return; }
  if(e.key==="Enter"){ if(resultsOpen) nextLevel(); return; }
  if(k==="n"){ nextLevel(); return; }
  if(k==="l"){ openLvSel(); return; }
  if(k==="c"){ rotateFollow=!rotateFollow; if(rotateFollow&&sim) camRot=-Math.PI/2-sim.st.theta; camSnap=true; return; }
  if(k==="t"){ trailsOn=!trailsOn; return; }
  if(/^[0-9]$/.test(k)){ const i=parseInt(k,10); if(i<LEVELS.length) loadLevel(i); return; }
  if(MOVE.includes(k)){ keys.add(k); fadeIntro(); e.preventDefault(); }
});
addEventListener("keyup", e=>{ const k=e.key.length===1?e.key.toLowerCase():e.key; keys.delete(k); });
addEventListener("blur", ()=>keys.clear());

$("ngGo").onclick=()=>{ audio.ensureAudio(); confirmName(); };
$("lvName").onclick=()=>{ closeLvSel(); openNameGate(name); };
$("tapRetry").onclick=()=>loadLevel(levelIdx);
$("tapNext").onclick=()=>nextLevel();
$("tapLevels").onclick=()=>openLvSel();

// ---------------------------------------------------------------- mouse steering
const stageEl = document.querySelector(".stage");
stageEl.addEventListener("mousemove", e=>{
  if(!sim || document.body.classList.contains("touch")) return;
  if(nameGateOpen||lvselOpen) return;
  mouseSteer = true;
  const r = stageEl.getBoundingClientRect();
  if(locked){
    deltaCur = clamp(deltaCur + e.movementX*(MAX_STEER/(r.width*0.5)), -MAX_STEER, MAX_STEER);
  } else {
    const frac = clamp((e.clientX - r.left)/r.width*2 - 1, -1, 1);
    const m = Math.pow(Math.abs(frac), 1.4);
    deltaCur = Math.sign(frac) * m * MAX_STEER;
  }
  fadeIntro();
});
stageEl.addEventListener("click", e=>{
  if(e.target.id!=="gl") return;
  if(document.body.classList.contains("touch")) return;
  audio.ensureAudio();
  if(document.pointerLockElement!==stageEl && stageEl.requestPointerLock){
    try{ stageEl.requestPointerLock(); }catch(_){}
  }
});
document.addEventListener("pointerlockchange", ()=>{ locked = (document.pointerLockElement===stageEl); });

// ---------------------------------------------------------------- touch
function enableTouchUI(){ document.body.classList.add("touch"); }
if(window.matchMedia && matchMedia("(pointer: coarse)").matches) enableTouchUI();
addEventListener("touchstart", ()=>{ enableTouchUI(); audio.ensureAudio(); }, {passive:true});

const steerZone=$("touchSteer"), thrZone=$("touchThrottle");
function steerFromTouch(t){
  if(!sim) return;
  const r=steerZone.getBoundingClientRect();
  const frac=clamp((t.clientX-r.left)/r.width*2-1,-1,1);
  const m=Math.pow(Math.abs(frac),1.4);
  deltaCur=Math.sign(frac)*m*MAX_STEER;
  mouseSteer=true; fadeIntro();
}
function thrFromTouch(t){
  const r=thrZone.getBoundingClientRect();
  const f=clamp((r.top+r.height/2-t.clientY)/(r.height/2),-1,1);
  const dead=0.08;
  touchThr = Math.abs(f)<dead ? 0 : (f-Math.sign(f)*dead)/(1-dead);
  fadeIntro();
}
function bindZone(el,onMove,onEnd){
  const move=e=>{ if(e.targetTouches.length) onMove(e.targetTouches[0]); e.preventDefault(); };
  const end =e=>{ if(e.targetTouches.length===0 && onEnd) onEnd(); e.preventDefault(); };
  el.addEventListener("touchstart",e=>{ enableTouchUI(); audio.ensureAudio(); if(e.targetTouches.length) onMove(e.targetTouches[0]); e.preventDefault(); },{passive:false});
  el.addEventListener("touchmove",move,{passive:false});
  el.addEventListener("touchend",end,{passive:false});
  el.addEventListener("touchcancel",end,{passive:false});
}
bindZone(steerZone, steerFromTouch, null);
bindZone(thrZone,   thrFromTouch,  ()=>{ touchThr=0; });
const brakeZone=$("touchBrake");
function setBrake(on){ touchBrake=on; brakeZone.classList.toggle("pressed",on); }
brakeZone.addEventListener("touchstart",e=>{ enableTouchUI(); audio.ensureAudio(); setBrake(true); e.preventDefault(); },{passive:false});
brakeZone.addEventListener("touchend",e=>{ setBrake(false); e.preventDefault(); },{passive:false});
brakeZone.addEventListener("touchcancel",e=>{ setBrake(false); e.preventDefault(); },{passive:false});

// ---------------------------------------------------------------- fixed-timestep loop
const lerpN  = (a,b,t)=> a + (b-a)*t;
const lerpAng= (a,b,t)=> a + norm(b-a)*t;
function captureState(){ const st=sim.st; return {x:st.x,y:st.y,theta:st.theta,phi:st.phi,delta:st.delta,v:st.v,
  pitch:st.pitch,roll:st.roll,trRoll:st.trRoll}; }
function lerpState(p,c,t){ return {
  x:lerpN(p.x,c.x,t), y:lerpN(p.y,c.y,t),
  theta:lerpAng(p.theta,c.theta,t), phi:lerpAng(p.phi,c.phi,t),
  delta:lerpN(p.delta,c.delta,t), v:c.v,
  pitch:lerpN(p.pitch,c.pitch,t), roll:lerpN(p.roll,c.roll,t),
  trRoll:lerpN(p.trRoll,c.trRoll,t) }; }

function tickOnce(){
  // steering feel (fixed-rate so it's frame-independent)
  if(isLeft()||isRight()) mouseSteer=false;
  if(!mouseSteer && !(feedQ&&feedQ.length)){
    let sf=0; if(isLeft()) sf-=STEER_FORCE; if(isRight()) sf+=STEER_FORCE;
    deltaCur += sf*TICK;
    deltaCur -= STEER_DRAG*deltaCur*TICK;
    const sr=STEER_ROLL*TICK; if(deltaCur>sr) deltaCur-=sr; else if(deltaCur<-sr) deltaCur+=sr; else deltaCur=0;
  }
  deltaCur = clamp(deltaCur, -MAX_STEER, MAX_STEER);
  let row;
  if(feedQ && feedQ.length){ row = feedQ.shift(); deltaCur = row[0]/8192; }
  else {
    const thr = clamp((isFwd()?1:0) + Math.max(0, touchThr), 0, 1);
    const rev = clamp((isRev()?1:0) + Math.max(0,-touchThr), 0, 1);
    row = rowFromInput(deltaCur, thr, rev, isBrake()||touchBrake, isHand());
  }
  if(recording && !sim.done) rows.push(row);
  const ev = sim.tick(inputFromRow(row));
  if(ev.died){
    if(ev.died==="cone") audio.clack();
    audio.buzz();
    $("deadBig").textContent = ev.died==="wall" ? "Crunch!" : ev.died==="cone" ? "Cone down!" : "Jackknifed";
    $("dead").classList.add("show"); $("ring").classList.add("on");
  }
  if(ev.respawned){
    $("dead").classList.remove("show"); $("ring").classList.remove("on");
    camSnap=true; teleported=true;
    trails.front.length=trails.rear.length=trails.trailer.length=0;
  }
  if(ev.done) finishRun();
}

let prevState=null, currState=null, acc=0, last=performance.now();
function frame(now){
  let dt=(now-last)/1000; last=now;
  dt=Math.min(dt,0.25);
  if(!(nameGateOpen||lvselOpen)){
    acc+=dt;
    let steps=0;
    while(acc>=TICK){
      prevState=currState;
      tickOnce();
      currState=captureState();
      acc-=TICK;
      if(teleported){ prevState=currState; acc=0; teleported=false; }
      if(++steps>=MAX_STEPS_PER_FRAME){ acc=0; break; }
    }
  }
  render(prevState, currState, clamp(acc/TICK,0,1));
  requestAnimationFrame(frame);
}

function pushTrail(a,x,y){ const l=a[a.length-1]; if(l&&(l[0]-x)**2+(l[1]-y)**2<TRAIL_MIN*TRAIL_MIN)return;
  a.push([x,y]); if(a.length>TRAIL_MAX)a.shift(); }

// ---------------------------------------------------------------- per-frame render + HUD
function render(prev, curr, alpha){
  const st=sim.st;
  const rs = lerpState(prev, curr, alpha);
  const c=Math.cos(rs.theta), s=Math.sin(rs.theta);
  const hitchX=rs.x-G.hitchC*c, hitchY=rs.y-G.hitchC*s;
  const frontX=rs.x+G.L*c, frontY=rs.y+G.L*s;
  const cp=Math.cos(rs.phi), sp=Math.sin(rs.phi);
  const trAxX=hitchX-G.draw_d*cp, trAxY=hitchY-G.draw_d*sp;

  let tx, ty;
  if(rotateFollow){
    const bk=112;
    const wvx = st.v*Math.cos(rs.theta) - st.vlat*Math.sin(rs.theta);
    const wvy = st.v*Math.sin(rs.theta) + st.vlat*Math.cos(rs.theta);
    tx = rs.x - bk*Math.cos(rs.theta) + wvx*0.08;
    ty = rs.y - bk*Math.sin(rs.theta) + wvy*0.08;
  } else { tx=(frontX+trAxX)/2; ty=(frontY+trAxY)/2; }
  const fv = Math.max(0, st.v), LOOK_K = 420;
  const lookTarget = rotateFollow ? (fv*fv)/(fv*fv + LOOK_K*LOOK_K) : 0;
  if(camSnap){
    cam.x=tx; cam.y=ty; if(rotateFollow) camRot=-Math.PI/2-rs.theta; camLook=lookTarget; camSnap=false;
  } else {
    cam.x+=(tx-cam.x)*0.07; cam.y+=(ty-cam.y)*0.07;
    if(rotateFollow) camRot += norm((-Math.PI/2 - rs.theta) - camRot)*0.048;
    camLook += (lookTarget - camLook)*0.05;
  }

  if(trailsOn && !sim.dead){ pushTrail(trails.front,frontX,frontY); pushTrail(trails.rear,rs.x,rs.y); pushTrail(trails.trailer,trAxX,trAxY); }

  bayGlowCur += (sim.bayGlow() - bayGlowCur) * 0.12;
  R.update(
    {x:rs.x, y:rs.y, theta:rs.theta, phi:rs.phi, delta:rs.delta, v:rs.v,
     pitch:rs.pitch, roll:rs.roll, trRoll:rs.trRoll},
    {camX:cam.x, camY:cam.y, camRot, camLook, rotateFollow, bayColor:bayColorAt(bayGlowCur), bayEdge:bayEdgeAt(bayGlowCur), trails, trailsOn}
  );

  // skidmarks + skid audio (same slip signals as the physics)
  const htC=G.carTrack/2, htT=G.trailerTrack/2;
  const spd=Math.abs(st.v);
  const fastSkid = spd > 30;
  const rearSkid  = !sim.dead && fastSkid && (st._ar>0.3 || st._gl>0.8);
  const trailSkid = !sim.dead && fastSkid && st._aT>0.2;
  R.updateSkids([
    {key:'rl', x:rs.x - s*htC,  y:rs.y + c*htC,  on:rearSkid},
    {key:'rr', x:rs.x + s*htC,  y:rs.y - c*htC,  on:rearSkid},
    {key:'tl', x:trAxX - sp*htT, y:trAxY + cp*htT, on:trailSkid},
    {key:'tr', x:trAxX + sp*htT, y:trAxY - cp*htT, on:trailSkid},
  ]);
  const brkSk = (isBrake()||touchBrake) && spd>25 ? 0.4+Math.min(0.6, spd/300) : 0;
  const latSk = fastSkid && st._ar>0.25 ? Math.min(1, (st._ar-0.25)*2.5) : 0;
  const drfSk = fastSkid && Math.abs(st.vlat)>10 ? Math.min(0.6, (Math.abs(st.vlat)-10)/60) : 0;
  const trlSk = fastSkid && st._aT>0.15 ? Math.min(0.8, st._aT*1.4) : 0;
  audio.updateSkid(sim.dead ? 0 : Math.max(brkSk, latSk, drfSk, trlSk), spd);

  // goal arrow
  const ga=$("goalArrow");
  if(level.bay && !resultsOpen){
    const a=R.aim(level.bay.x, level.bay.y);
    if(a.onscreen) ga.style.display="none";
    else {
      const cw=glCanvas.clientWidth, ch=glCanvas.clientHeight;
      let dx=a.dirx, dy=a.diry;
      if(Math.abs(dx)<1e-6 && Math.abs(dy)<1e-6) dy=1;
      const touch=document.body.classList.contains("touch");
      const insT = touch ? 58 : 82;
      const insL = 46, insR = 46;
      let insB = 64;
      if(touch){ const tsz=$("touchSteer"); insB = (tsz?tsz.getBoundingClientRect().height:170) + 22; }
      const left=insL, right=Math.max(insL+80, cw-insR);
      const top=insT, bottom=Math.max(insT+80, ch-insB);
      const cxp=(left+right)/2, cyp=(top+bottom)/2, hxp=(right-left)/2, hyp=(bottom-top)/2;
      const sc=Math.min(hxp/Math.abs(dx||1e-6), hyp/Math.abs(dy||1e-6));
      ga.style.transform=`translate(${cxp+dx*sc-17}px,${cyp+dy*sc-17}px) rotate(${Math.atan2(dy,dx)}rad)`;
      ga.style.display="";
    }
  } else ga.style.display="none";

  // steering bar (+ jackknife danger tint)
  const deg=st.delta*180/Math.PI;
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
  $("steerMid").textContent = "STEER · "+Math.abs(deg).toFixed(0)+"° "+(deg>0.5?"R":(deg<-0.5?"L":""));
  const artic=Math.abs(norm(st.theta-st.phi));
  $("steerbar").classList.toggle('danger', artic > 0.7*JACK_TRIGGER);
  // touch steering readout mirrors the same fill
  const tf=$("tsbFill");
  if(fr>=0){ tf.style.left="50%"; tf.style.right="auto"; tf.style.width=Wp+"%"; }
  else { tf.style.right="50%"; tf.style.left="auto"; tf.style.width=Wp+"%"; }
  tf.style.backgroundColor = sf.style.backgroundColor;

  // run clock
  if(level.id!=='free'){
    const m=sim.metrics();
    $("hudTime").textContent=(m.timeMs/1000).toFixed(1);
    $("hudDist").textContent=fmtDist(m.dist);
  }

  // touch throttle widget follows the finger exactly
  const ttf=$("ttFill"), ttt=$("ttThumb");
  if(touchThr>=0){ ttf.style.top=(50-50*touchThr)+"%"; ttf.style.height=(50*touchThr)+"%"; ttf.style.background="var(--good)"; }
  else { ttf.style.top="50%"; ttf.style.height=(50*-touchThr)+"%"; ttf.style.background="var(--warn)"; }
  ttt.style.top=(50-44*touchThr)+"%";

  // engine audio load: inertial low-pass of the input
  const tgt=clamp((isFwd()?1:0)-(isRev()?1:0)+touchThr,-1,1);
  const rate = (Math.abs(tgt) > Math.abs(thrDisp) || (tgt!==0 && Math.sign(tgt)!==Math.sign(thrDisp))) ? 0.05 : 0.022;
  thrDisp += (tgt-thrDisp)*rate;
  if(Math.abs(thrDisp)<0.002) thrDisp=0;
  audio.updateEngine(st.v, thrDisp);

  if(!introFaded && sim.moving) fadeIntro();
}

// ---------------------------------------------------------------- boot
R.resize();
loadLevel(1);
if(!name) openNameGate('');
else $("lvName").textContent=name;
requestAnimationFrame(frame);

// ---------------------------------------------------------------- debug/test hooks
window.__tt = () => { const st=sim.st; return { v:st.v, vlat:st.vlat, om:st.omega, omT:st.omegaT, delta:st.delta,
  artic:norm(st.theta-st.phi)*57.3, ar:st._ar, gl:st._gl, aT:st._aT,
  skids:R.skidCountDbg?R.skidCountDbg():-1, pitch:st.pitch*57.3, roll:st.roll*57.3, trRoll:st.trRoll*57.3,
  dead:sim.dead, done:sim.done }; };
window.__hitch = () => R.hitchDbg();
window.__audio = () => audio.audioDebug();
window.__run = () => ({ seed, level: level.id, ticks: rows.length, done: sim.done, metrics: sim.metrics(), name });
// e2e: reload current level with a forced seed and feed a packed input log as if typed
window.__feed = (forcedSeed, packed) => {
  loadLevel(levelIdx, forcedSeed);
  fadeIntro();
  feedQ = [];
  for(const p of packed){ for(let i=0;i<p[0];i++) feedQ.push([p[1],p[2],p[3],p[4]]); }
};
window.__setName = (n) => { name=n; try{ localStorage.setItem(LS_NAME,n); }catch(e){} nameGateOpen=false; $("nameGate").classList.remove("show"); $("lvName").textContent=n; };
})();
