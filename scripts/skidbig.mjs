import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1000,height:780}, deviceScaleFactor:1.4 });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.keyboard.down('e'); await page.waitForTimeout(3000);      // get fast
await page.keyboard.down('f'); await page.waitForTimeout(2400);      // big committed drift -> lots of rubber
await page.keyboard.up('e'); await page.keyboard.up('f');
await page.keyboard.down('Control'); await page.waitForTimeout(1800); await page.keyboard.up('Control');
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down
await page.waitForTimeout(2800);
const sk=await page.evaluate(()=>window.__tt().skids);
await page.screenshot({ path: process.argv[2] });
console.log('skid quads:', sk);
await browser.close();
