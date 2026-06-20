import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(2600);
await page.keyboard.down('f'); await page.waitForTimeout(450);     // gentle turn
const b=await tt();
await page.keyboard.down('Shift');                                 // fling the trailer
let peakOm=Math.abs(b.om), peakArt=Math.abs(b.artic), bad=false;
for(let i=0;i<16;i++){ await page.waitForTimeout(100); const t=await tt(); peakOm=Math.max(peakOm,Math.abs(t.om)); peakArt=Math.max(peakArt,Math.abs(t.artic)); if(!isFinite(t.v)||Math.abs(t.v)>3000) bad=true; }
await page.keyboard.up('Shift'); await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:', errs.length?errs.join('|'):'(none)', '| blewUp:', bad);
console.log('car yaw om before fling:', Math.abs(b.om).toFixed(2), '-> peak during fling:', peakOm.toFixed(2), '(artic peak', peakArt.toFixed(0)+')');
await browser.close();
