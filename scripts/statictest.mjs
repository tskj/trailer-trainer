import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1000,height:760}, deviceScaleFactor:1.4 });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(400);
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down
await page.waitForTimeout(600);
await page.screenshot({ path: process.argv[2] });
await browser.close();
