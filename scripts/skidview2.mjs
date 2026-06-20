import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:820}, deviceScaleFactor:1.4 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down from the start
await page.waitForTimeout(200);
await page.keyboard.down('e'); await page.waitForTimeout(1400);        // get to moderate speed
await page.keyboard.down('f'); await page.waitForTimeout(1100);        // brief drift -> lay rubber near origin
await page.keyboard.up('e'); await page.keyboard.up('f');
await page.waitForTimeout(900);
await page.screenshot({ path: process.argv[2] });
console.log('errors:', errs.length?errs.join('|'):'(none)');
await browser.close();
