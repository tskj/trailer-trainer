// All game audio: jingles, the V8 worklet engine, tire skids.
// Pure client concern — the sim never touches this.
import { MAX_SPEED } from './sim.js';

let actx = null;
export function audioCtx(){ return actx; }

function ctx(){
  actx = actx || new (window.AudioContext||window.webkitAudioContext)();
  if(actx.state === "suspended") actx.resume();
  return actx;
}

export function buzz(){
  try{
    const t = ctx().currentTime;
    [58,87].forEach((freq)=>{
      const o=actx.createOscillator(), g=actx.createGain();
      o.type="triangle"; o.frequency.value=freq;
      o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.08,t+0.05);
      g.gain.setValueAtTime(0.08,t+0.9);
      g.gain.exponentialRampToValueAtTime(0.0001,t+3.4);
      o.start(t); o.stop(t+3.45);
    });
  }catch(e){}
}
export function clack(){
  try{
    const t = ctx().currentTime;
    const len=Math.floor(actx.sampleRate*0.06), buf=actx.createBuffer(1,len,actx.sampleRate), dat=buf.getChannelData(0);
    for(let i=0;i<len;i++) dat[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);
    const n=actx.createBufferSource(); n.buffer=buf;
    const nf=actx.createBiquadFilter(); nf.type="bandpass"; nf.frequency.value=440; nf.Q.value=0.9;
    const ng=actx.createGain(); ng.gain.value=0.17;
    n.connect(nf); nf.connect(ng); ng.connect(actx.destination); n.start(t);
    const o=actx.createOscillator(), g=actx.createGain();
    o.type="triangle"; o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(150,t+0.09);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.13,t+0.006); g.gain.exponentialRampToValueAtTime(0.0001,t+0.13);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t+0.14);
  }catch(e){}
}
export function chime(){
  try{
    const t = ctx().currentTime;
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
// AudioWorklet pulse-train synth; see the design notes in git history. The pulses
// land in the uneven per-bank pattern of a crossplane V8 (L R R L R L L R) — the
// source of the lumpy idle burble. Falls back to an oscillator stack pre-worklet.
const V8_SRC = `registerProcessor("v8-rumble", class extends AudioWorkletProcessor {
  static get parameterDescriptors(){ return [
    {name:"firing", defaultValue:26, minValue:5, maxValue:220, automationRate:"k-rate"},
    {name:"load",   defaultValue:0,  minValue:0, maxValue:1,   automationRate:"k-rate"}]; }
  constructor(){ super();
    this.ph=0; this.sub=0; this.lpn=0;
    this.evL=[0,270,450,540].map(d=>d/720);
    this.evR=[90,180,360,630].map(d=>d/720);
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
      L.v+=(-wL*wL*L.y-2*zt*wL*L.v)*dt; L.y+=L.v*dt;
      R.v+=(-wR*wR*R.y-2*zt*wR*R.v)*dt; R.y+=R.v*dt;
      this.lpn+=((Math.random()*2-1)-this.lpn)*nk;
      const nz=this.lpn*(L.e+R.e); L.e*=eDec; R.e*=eDec;
      this.sub+=6.2832*f*dt; if(this.sub>6.2832)this.sub-=6.2832;
      const s=(L.y+R.y)*1.5 + nz*0.7 + Math.sin(this.sub)*(0.22+0.3*load);
      out[i]=Math.tanh(s*(1.15+0.85*load));
    }
    return true;
  }
});`;
let engine=null, engineBooting=false, skid=null;
export function ensureAudio(){
  if(engine||engineBooting) return;
  try{
    ctx();
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
    const lp=actx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=180; lp.Q.value=0.4; lp.connect(master);
    const shaper=actx.createWaveShaper(); shaper.oversample="4x";
    { const n=1024, c=new Float32Array(n), k=2.2; for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(k*x); } shaper.curve=c; }
    shaper.connect(lp);
    const bus=actx.createGain(); bus.gain.value=0.42; bus.connect(shaper);
    const lfo=actx.createOscillator(); lfo.type="triangle"; lfo.frequency.value=24;
    const lfoGain=actx.createGain(); lfoGain.gain.value=0.30; lfo.connect(lfoGain); lfoGain.connect(bus.gain); lfo.start();
    const oscs=[0.5,1,2,3].map((mult,i)=>{
      const o=actx.createOscillator(); o.type=["sine","sawtooth","sawtooth","triangle"][i]; o.frequency.value=20*mult;
      const g=actx.createGain(); g.gain.value=[0.66,0.34,0.08,0.02][i];
      o.connect(g); g.connect(bus); o.start(); return {o,mult};
    });
    const buf=actx.createBuffer(1,actx.sampleRate,actx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const noise=actx.createBufferSource(); noise.buffer=buf; noise.loop=true;
    const nf=actx.createBiquadFilter(); nf.type="lowpass"; nf.frequency.value=85; nf.Q.value=0.7;
    const ng=actx.createGain(); ng.gain.value=0.0;
    noise.connect(nf); nf.connect(ng); ng.connect(bus); noise.start();
    return {master,oscs,nf,ng,lfo,lp};
  }catch(e){ return null; }
}
export function updateEngine(speed, throttleAmt){
  if(!engine||!actx) return;
  const t=actx.currentTime, sp=Math.abs(speed), load=Math.min(1,Math.abs(throttleAmt)), rev=Math.min(1,sp/MAX_SPEED);
  if(engine.worklet){
    engine.pF.setTargetAtTime(24 + Math.sqrt(sp)*2.1 + load*6, t, 0.06);
    engine.pL.setTargetAtTime(Math.min(1, 0.75*load + 0.3*rev), t, 0.09);
    engine.lp.frequency.setTargetAtTime(230 + sp*0.85, t, 0.08);
    engine.master.gain.setTargetAtTime(0.22*(0.45+0.55*rev+0.4*load), t, 0.08);
    return;
  }
  const f0=20 + Math.sqrt(sp)*1.5 + load*5;
  for(const {o,mult} of engine.oscs) o.frequency.setTargetAtTime(f0*mult, t, 0.06);
  engine.lfo.frequency.setTargetAtTime(Math.max(6, f0*0.45), t, 0.05);
  engine.lp.frequency.setTargetAtTime(175 + sp*0.9, t, 0.08);
  engine.nf.frequency.setTargetAtTime(85 + sp*0.5, t, 0.06);
  engine.ng.gain.setTargetAtTime(0.28*(0.5+0.5*load), t, 0.08);
  engine.master.gain.setTargetAtTime(0.11*(0.45+0.55*rev+0.4*load), t, 0.08);
}

// ---- tire skid: noise through resonant bandpasses + scrub bed; pitch rides speed ----
function buildSkid(){
  try{
    const buf=actx.createBuffer(1, actx.sampleRate*2, actx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const src=actx.createBufferSource(); src.buffer=buf; src.loop=true;
    const master=actx.createGain(); master.gain.value=0; master.connect(actx.destination);
    const mk=(type,f,q,g)=>{ const b=actx.createBiquadFilter(); b.type=type; b.frequency.value=f; b.Q.value=q;
      const gn=actx.createGain(); gn.gain.value=g; src.connect(b); b.connect(gn); gn.connect(master); return b; };
    const bp1=mk("bandpass", 1100, 9, 3.0);
    const bp2=mk("bandpass", 1600, 11, 2.0);
    mk("bandpass", 420, 0.8, 1.1);
    const lfo=actx.createOscillator(); lfo.type="sine"; lfo.frequency.value=6.5;
    const lg=actx.createGain(); lg.gain.value=70; lfo.connect(lg); lg.connect(bp1.frequency); lg.connect(bp2.frequency);
    src.start(); lfo.start();
    return {master,bp1,bp2};
  }catch(e){ return null; }
}
export function updateSkid(lvl, sp){
  if(!skid||!actx) return;
  const t=actx.currentTime;
  const f=800 + Math.min(700, sp*2.2);
  skid.bp1.frequency.setTargetAtTime(f, t, 0.06);
  skid.bp2.frequency.setTargetAtTime(f*1.45, t, 0.06);
  skid.master.gain.setTargetAtTime(lvl>0.02 ? 0.3*lvl : 0, t, lvl>0.02 ? 0.03 : 0.09);
}

// debug probe for test scripts
export function audioDebug(){ return { actx, engine, skid }; }
