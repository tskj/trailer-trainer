// Verify the hitch stays coupled: the car's hitch anchor and the trailer's tongue tip must
// share the same world point through accel/brake/corner. Also grabs screenshots of the junction.
import { chromium } from 'playwright';
const DIR='/tmp/claude-1000/-home-tskj-code-trailer-trainer/2a7e12cd-4720-4e93-b5c2-750b690cef6f/scratchpad/';
const url='http://localhost:5173/';
const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newContext({ viewport:{width:900,height:760}, deviceScaleFactor:1 }).then(c=>c.newPage());
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(url,{waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());  // Free drive
await page.waitForTimeout(400);
const tt=async()=>await page.evaluate(()=>window.__tt());
const hh=async()=>await page.evaluate(()=>window.__hitch());
const shoot=(n)=>page.screenshot({path:DIR+n,timeout:120000,animations:'disabled',clip:{x:300,y:170,width:300,height:380}});
async function until(pred,maxMs=20000){ const t0=Date.now(); let t; do{ t=await tt(); if(pred(t)) return t; await page.waitForTimeout(50);}while(Date.now()-t0<maxMs); return t; }
let maxGap=0; const gaps={};
const rec=async(label)=>{ const h=await hh(); maxGap=Math.max(maxGap,h.gap); gaps[label]=+h.gap.toFixed(4); return h; };

await rec('rest');
// launch
await page.keyboard.down('e'); await until(t=>t.v>60); await rec('accel'); await shoot('hitch_accel.png');
await until(t=>t.v>150,12000); await page.keyboard.up('e');
// hard brake (car nose dives, hitch rises -> trailer must follow)
await page.keyboard.down('e'); await until(t=>t.v>155,15000); await page.keyboard.up('e');
await page.keyboard.down('Control'); await until(t=>t.pitch<-3.5,8000); await rec('brake'); await shoot('hitch_brake.png');
await page.keyboard.up('Control'); await until(t=>Math.abs(t.v)<5,8000);
// corner (both lean)
await page.keyboard.down('e'); await until(t=>t.v>80,15000); await page.keyboard.down('f');
await until(t=>Math.abs(t.roll)>2.6,8000); await rec('corner'); await shoot('hitch_corner.png');
await page.keyboard.up('f'); await page.keyboard.up('e');
// reverse
await page.keyboard.down('d'); await until(t=>t.v<-25,12000); await rec('reverse');
await page.keyboard.up('d');

console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('coupling gap (world units) per state:', JSON.stringify(gaps));
console.log('MAX gap across all maneuvers:', maxGap.toFixed(5), maxGap<0.01?'-> COUPLED (effectively zero)':'-> DRIFT!');
const h=await hh(); console.log('sample  car hitch:', h.car.map(n=>n.toFixed(1)), ' tongue:', h.tongue.map(n=>n.toFixed(1)));
await browser.close();
