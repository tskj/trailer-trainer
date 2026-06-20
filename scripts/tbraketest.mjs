import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
// drive at speed in a gentle turn, then hit the TRAILER brake (Shift) -> should swing out
await page.keyboard.down('e'); await page.waitForTimeout(2500);
await page.keyboard.down('f'); await page.waitForTimeout(500);   // gentle turn
const before=await tt();
await page.keyboard.down('Shift');                              // trailer brake
let peakArt=Math.abs(before.artic);
for(let i=0;i<12;i++){ await page.waitForTimeout(110); const t=await tt(); peakArt=Math.max(peakArt,Math.abs(t.artic)); }
const after=await tt();
await page.keyboard.up('Shift'); await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('artic before trailer-brake:', Math.abs(before.artic).toFixed(0), '-> peak with Shift:', peakArt.toFixed(0), '(speed held:', after.v.toFixed(0)+')');
await browser.close();
