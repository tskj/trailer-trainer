import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());  // Free drive (open space)
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
const ext={pitch:[0,0],roll:[0,0],trRoll:[0,0]};
const track=t=>{ for(const k of Object.keys(ext)){ ext[k][0]=Math.min(ext[k][0],t[k]); ext[k][1]=Math.max(ext[k][1],t[k]); } };
const sample=async(ms,step=60)=>{ for(let i=0;i<ms/step;i++){ await page.waitForTimeout(step); track(await tt()); } };

// 1) accelerate forward from rest -> expect nose-UP (pitch +), tail squat
await page.keyboard.down('e'); await sample(1400);
const accel=await tt(); await page.keyboard.up('e');
await page.waitForTimeout(1500);                       // let it coast/settle a bit at speed

// 2) get up to speed then brake HARD -> expect nose DIVE (pitch -)
await page.keyboard.down('e'); await page.waitForTimeout(2500); await page.keyboard.up('e');
let diveMin=99; await page.keyboard.down('Control');
for(let i=0;i<18;i++){ await page.waitForTimeout(60); const t=await tt(); track(t); diveMin=Math.min(diveMin,t.pitch); }
await page.keyboard.up('Control');
await page.waitForTimeout(1800);

// 3) reverse from rest -> expect nose DOWN / tail up (pitch -)
await page.keyboard.down('d'); await sample(1400); const rev=await tt(); await page.keyboard.up('d');
await page.waitForTimeout(1500);

// 4) corner: cruise forward and hold a steer -> expect roll (lean) on car + trailer
await page.keyboard.down('e'); await page.waitForTimeout(1200);
await page.keyboard.down('f'); let rollMag=0,trRollMag=0;
for(let i=0;i<30;i++){ await page.waitForTimeout(80); const t=await tt(); track(t); rollMag=Math.max(rollMag,Math.abs(t.roll)); trRollMag=Math.max(trRollMag,Math.abs(t.trRoll)); }
await page.keyboard.up('f'); await page.keyboard.up('e');

console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('accel(fwd):  pitch=%s°  (want +, nose up)', accel.pitch.toFixed(2));
console.log('hard brake:  min pitch=%s°  (want clearly -, dive)', diveMin.toFixed(2));
console.log('reverse:     pitch=%s°  (want -, nose down)', rev.pitch.toFixed(2));
console.log('corner:      |roll| car=%s°  trailer=%s°', rollMag.toFixed(2), trRollMag.toFixed(2));
console.log('overall ranges (deg):', JSON.stringify(Object.fromEntries(Object.entries(ext).map(([k,v])=>[k,[v[0].toFixed(2),v[1].toFixed(2)]]))));
await browser.close();
