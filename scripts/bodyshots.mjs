// Capture the rig mid-dive (hard brake) and mid-lean (corner) to eyeball the body dynamics.
// Condition-driven (polls telemetry) so it works even when software-GL runs the sim slow.
import { chromium } from 'playwright';
const DIR='/tmp/claude-1000/-home-tskj-code-trailer-trainer/2a7e12cd-4720-4e93-b5c2-750b690cef6f/scratchpad/';
const url='http://localhost:5174/';
const browser = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newContext({ viewport:{width:960,height:640}, deviceScaleFactor:1 }).then(c=>c.newPage());
await page.goto(url,{waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());  // Free drive
await page.waitForTimeout(400);
const tt=async()=>await page.evaluate(()=>window.__tt());
const shoot=(n)=>page.screenshot({path:DIR+n,timeout:120000,animations:'disabled'});
// poll until pred(telemetry) or timeout; returns last telemetry
async function until(pred, maxMs=20000){ const t0=Date.now(); let t; do{ t=await tt(); if(pred(t)) return t; await page.waitForTimeout(50);}while(Date.now()-t0<maxMs); return t; }

// 1) launch squat: hold throttle, shoot while still accelerating hard (pitch rising)
await page.keyboard.down('e');
let a=await until(t=>t.v>55);
await shoot('dyn_accel.png');
await until(t=>t.v>140, 12000); await page.keyboard.up('e');
await until(t=>true,300);

// 2) hard brake dive: from speed, stand on the brake, shoot once the nose has pitched down
await page.keyboard.down('e'); await until(t=>t.v>150,15000); await page.keyboard.up('e');
await page.keyboard.down('Control');
let b=await until(t=>t.pitch<-3.5, 8000);
await shoot('dyn_brake.png');
await page.keyboard.up('Control'); await until(t=>Math.abs(t.v)<5,8000);

// 3) corner lean: get rolling, hold a steer, shoot at full lean
await page.keyboard.down('e'); await until(t=>t.v>80,15000);
await page.keyboard.down('f');
let c=await until(t=>Math.abs(t.roll)>2.6, 8000);
await shoot('dyn_corner.png');
await page.keyboard.up('f'); await page.keyboard.up('e');

console.log('accel : v=%s pitch=%s° (squat)', a.v.toFixed(0), a.pitch.toFixed(2));
console.log('brake : v=%s pitch=%s° trPitch=%s° (dive)', b.v.toFixed(0), b.pitch.toFixed(2), b.trPitch.toFixed(2));
console.log('corner: v=%s roll=%s° trRoll=%s°', c.v.toFixed(0), c.roll.toFixed(2), c.trRoll.toFixed(2));
await browser.close();
