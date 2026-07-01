// Level definitions — shared by the browser client and the Node verifier.
// Bay half-dims are resolved onto each level's bay at module load, so the sim
// and the renderer both read level.bay.{hl,hw} directly.
import { G } from './sim.js';

const BAY = {
  trailer:{ hl: G.TR_HL+9, hw: G.TR_HW+8 },
  car:    { hl: G.CAR_HL+13, hw: G.CAR_HW+11 },
  rig:    { hl: (G.CAR_HL+G.CAR_CTR + G.hitchC+G.boxBack)/2 + 14, hw: 15+9 }
};

export const LEVELS = [
  { id:"free", name:"Free drive",
    goal:"Sandbox — no clock, no cones. Practice backing, or find out what the handbrake does at speed.",
    start:{x:0,y:0,th:-Math.PI/2}, bay:null, obstacles:[] },

  { id:"l1", name:"1 · Straight back-in",
    goal:"Back the trailer straight into the bay. It starts slightly kinked — line it up first.",
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
    goal:"Reverse the whole cone channel and tuck the trailer against the back wall.",
    start:{x:0,y:390,th:Math.PI/2},
    bay:{x:0,y:-70,ang:Math.PI/2,fit:"trailer"},
    obstacles:[ {t:"half",axis:"y",at:-122,sign:-1},
                {t:"cone",x:-45,y:311},{t:"cone",x:-45,y:259},{t:"cone",x:-45,y:207},{t:"cone",x:-45,y:155},{t:"cone",x:-45,y:103},{t:"cone",x:-45,y:51},{t:"cone",x:-45,y:-1},{t:"cone",x:-45,y:-53},{t:"cone",x:-45,y:-105},
                {t:"cone",x:45,y:311},{t:"cone",x:45,y:259},{t:"cone",x:45,y:207},{t:"cone",x:45,y:155},{t:"cone",x:45,y:103},{t:"cone",x:45,y:51},{t:"cone",x:45,y:-1},{t:"cone",x:45,y:-53},{t:"cone",x:45,y:-105} ] },

  { id:"sweep", name:"4 · Short sweep ↩",
    goal:"Back the trailer around the bend and up the far leg onto the pad.",
    start:{x:160,y:-398,th:0},
    bay:{x:-420,y:180,ang:Math.PI/2,fit:"trailer"},
    obstacles:[ {t:"quad",ex:-360,ey:-360,ccx:0,ccy:0,r:360,mode:"in",n:8},
                {t:"cone",x:-438,y:250},{t:"cone",x:-402,y:250} ] },

  { id:"roundabout", name:"5 · Roundabout ↩",
    goal:"Reverse around the island and back onto the pad in the left arm. Take it wide.",
    start:{x:0,y:330,th:Math.PI/2},
    bay:{x:-340,y:0,ang:0,fit:"trailer"},
    obstacles:[ {t:"disc",cx:0,cy:0,r:85,mode:"in"},
                {t:"quad",ex:110,ey:110,ccx:270,ccy:270,r:160,mode:"in",n:8},
                {t:"quad",ex:110,ey:110,ccx:270,ccy:270,r:160,mode:"in",n:8,flipx:true},
                {t:"cone",x:-120,y:95},{t:"cone",x:-92,y:62},
                {t:"cone",x:-410,y:-18},{t:"cone",x:-410,y:18} ] },

  { id:"sweepLong", name:"6 · Long sweep ↩",
    goal:"The big one, all in reverse: the long sustained bend, then the pad at the far end.",
    start:{x:-680,y:-1298,th:0},
    bay:{x:-1320,y:-720,ang:Math.PI/2,fit:"trailer"},
    obstacles:[ {t:"quad",ex:-1260,ey:-1260,ccx:0,ccy:0,r:1260,mode:"in",n:8},
                {t:"cone",x:-1338,y:-650},{t:"cone",x:-1302,y:-650} ] },

  { id:"l5", name:"7 · Parallel park",
    goal:"Swing the rig around, then back the trailer into the cone-marked slot at the curb.",
    start:{x:220,y:85,th:Math.PI},
    bay:{x:30,y:-12,ang:0,fit:"trailer"},
    obstacles:[ {t:"cone",x:-32,y:-36},{t:"cone",x:-32,y:-12},{t:"cone",x:-32,y:12},
                {t:"cone",x:175,y:8},
                {t:"half",axis:"y",at:-49,sign:-1} ] },

  { id:"l3", name:"8 · 90° alley dock",
    goal:"Drive past the bay, then back in with one continuous 90° turn — no room to straighten.",
    start:{x:-310,y:-30,th:0},
    bay:{x:80,y:90,ang:Math.PI/2,fit:"trailer"},
    obstacles:[ {t:"half",axis:"y",at:-129,sign:-1},
                {t:"half",axis:"y",at:152,sign:1},
                {t:"cone",x:44,y:48},{t:"cone",x:116,y:48} ] },

  { id:"slalom", name:"9 · Reverse slalom ↩",
    goal:"Weave the trailer back through the slalom — left of one, right of the next — into the bay.",
    start:{x:0,y:840,th:Math.PI/2},
    bay:{x:0,y:-310,ang:Math.PI/2,fit:"trailer"},
    obstacles:[ {t:"half",axis:"x",at:-56,sign:-1}, {t:"half",axis:"x",at:56,sign:1},
                {t:"cone",x:-18,y:-380},{t:"cone",x:18,y:-380},
                {t:"cone",x:-18,y:610},{t:"cone",x:18,y:420},{t:"cone",x:-18,y:230},{t:"cone",x:18,y:40},{t:"cone",x:-18,y:-150} ] }
];

// resolve bay half-dims once
for(const lv of LEVELS){
  if(lv.bay){ const d = BAY[lv.bay.fit]; lv.bay.hl = lv.bay.hl || d.hl; lv.bay.hw = lv.bay.hw || d.hw; }
}
export const levelById = id => LEVELS.find(l => l.id === id);
