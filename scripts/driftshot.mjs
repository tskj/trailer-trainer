import { chromium } from 'playwright';
const out=process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:780}, deviceScaleFactor:1.5 });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.keyboard.down('e'); await page.waitForTimeout(3800);
await page.keyboard.down('f'); await page.waitForTimeout(950);   // mid-slide
await page.screenshot({ path: out });
const t=await page.evaluate(()=>window.__tt());
console.log('mid-drift: v=',t.v.toFixed(0),'vlat=',t.vlat.toFixed(0),'om=',t.om.toFixed(2));
await page.keyboard.up('f'); await page.keyboard.up('e');
await browser.close();
