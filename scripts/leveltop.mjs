import { chromium } from 'playwright';
const idx=Number(process.argv[2]||0), out=process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:900,height:820}, deviceScaleFactor:1.3 });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.waitForTimeout(300);
await page.evaluate(i=>document.querySelectorAll('#levelList .lvl')[i]?.click(), idx);
await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down
await page.waitForTimeout(700);
await page.screenshot({ path: out });
await browser.close();
