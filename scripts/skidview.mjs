import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:820}, deviceScaleFactor:1.4 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.keyboard.down('e'); await page.waitForTimeout(2500);
await page.keyboard.down('f');                          // sustained drift -> carve an arc of rubber
await page.waitForTimeout(2600);
await page.keyboard.up('f'); await page.keyboard.up('e');
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down to see the marks
await page.waitForTimeout(800);
await page.screenshot({ path: process.argv[2] });
console.log('errors:', errs.length?errs.join('|'):'(none)');
await browser.close();
