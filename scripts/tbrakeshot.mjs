import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:780}, deviceScaleFactor:1.5 });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.keyboard.down('e'); await page.waitForTimeout(2400);
await page.keyboard.down('f'); await page.waitForTimeout(400);
await page.keyboard.down('Shift'); await page.waitForTimeout(750);   // trailer brake mid-turn -> swing
await page.screenshot({ path: process.argv[2] });
const t=await page.evaluate(()=>window.__tt());
console.log('artic=', Math.abs(t.artic).toFixed(0), 'v=', t.v.toFixed(0));
await browser.close();
