import { chromium } from 'playwright';
const DIR='/tmp/claude-1000/-home-tskj-code-trailer-trainer/2a7e12cd-4720-4e93-b5c2-750b690cef6f/scratchpad/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1000,height:760}, deviceScaleFactor:2 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await page.waitForTimeout(300);
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[1]?.click());  // level 1 has a bay
await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('btnCam')?.click());                // top-down camera
await page.waitForTimeout(200);
// reverse toward the bay so it comes into frame, then stop short of the cones
await page.keyboard.down('d'); await page.waitForTimeout(3700); await page.keyboard.up('d');
await page.waitForTimeout(700);
await page.screenshot({path:DIR+'bay_dashes.png',timeout:60000,clip:{x:255,y:545,width:240,height:205}});
console.log('errors:', errs.length?errs.join('|'):'(none)');
await browser.close();
