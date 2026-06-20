import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
// 1) GENTLE turn at moderate speed: trailer should track (low artic, car grips)
await page.keyboard.down('e'); await page.waitForTimeout(1400);
await page.keyboard.down('f'); await page.waitForTimeout(600);
let g=await tt();
await page.keyboard.up('f');
await page.waitForTimeout(400);
// 2) HARD turn at HIGH speed: trailer should slip & drag the car out
await page.waitForTimeout(1800);  // build speed
await page.keyboard.down('f');
let peakVlat=0, peakArt=0, bad=false;
for(let i=0;i<16;i++){ await page.waitForTimeout(100); const t=await tt(); peakVlat=Math.max(peakVlat,Math.abs(t.vlat)); peakArt=Math.max(peakArt,Math.abs(t.artic)); if(!isFinite(t.v)||Math.abs(t.v)>4000)bad=true; }
await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:',errs.length?errs.join('|'):'(none)','blewUp:',bad);
console.log('gentle turn  -> artic',Math.abs(g.artic).toFixed(0),'car vlat',Math.abs(g.vlat).toFixed(0),'(should track/grip)');
console.log('hard+fast    -> peak artic',peakArt.toFixed(0),'peak car vlat',peakVlat.toFixed(0),'(should slip & drag)');
await browser.close();
