import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/rig.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1000,height:900}, deviceScaleFactor:1.5 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click()); // free drive (rig at origin)
await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down
await page.waitForTimeout(700);
await page.screenshot({ path: out });
console.log('errors:', errs.length?errs.join('|'):'(none)', '->', out);
await browser.close();
