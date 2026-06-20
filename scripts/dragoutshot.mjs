import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:780}, deviceScaleFactor:1.5 });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.keyboard.down('e'); await page.waitForTimeout(3600);
await page.keyboard.down('f'); await page.waitForTimeout(1900);   // sustained hard turn -> trailer lets go, drags car
await page.screenshot({ path: process.argv[2] });
const t=await page.evaluate(()=>window.__tt());
console.log('v=',t.v.toFixed(0),'vlat=',t.vlat.toFixed(0),'artic=',Math.abs(t.artic).toFixed(0));
await page.keyboard.up('f'); await page.keyboard.up('e');
await browser.close();
