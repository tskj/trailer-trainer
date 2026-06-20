import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:780}, deviceScaleFactor:1.5 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(3800);
// drift: hard steer; then add brake to break the trailer loose
await page.keyboard.down('f'); await page.waitForTimeout(700);
let peakA=0, peakOmT=0;
for(let i=0;i<6;i++){ await page.waitForTimeout(120); const t=await tt(); peakA=Math.max(peakA,Math.abs(t.artic)); peakOmT=Math.max(peakOmT,Math.abs(t.omT)); }
await page.keyboard.down('Control');                 // brake mid-drift -> trailer should fishtail
for(let i=0;i<8;i++){ await page.waitForTimeout(120); const t=await tt(); peakA=Math.max(peakA,Math.abs(t.artic)); peakOmT=Math.max(peakOmT,Math.abs(t.omT)); }
await page.screenshot({ path: process.argv[2] });
await page.keyboard.up('f'); await page.keyboard.up('e'); await page.keyboard.up('Control');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('peak |artic|=', peakA.toFixed(1), 'deg | peak |omegaT|=', peakOmT.toFixed(2));
await browser.close();
