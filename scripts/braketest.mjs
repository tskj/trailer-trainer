import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(4000); await page.keyboard.up('e');
const before=await tt();
// brake + steer (Scandinavian-ish): should break rear loose via friction circle
await page.keyboard.down('Control'); await page.keyboard.down('f');
let peak=0; for(let i=0;i<14;i++){ await page.waitForTimeout(120); const t=await tt(); peak=Math.max(peak,Math.abs(t.vlat)); }
await page.keyboard.up('Control'); await page.keyboard.up('f');
const after=await tt();
console.log('before brake v=',before.v.toFixed(0));
console.log('peak |vlat| under brake+steer:', peak.toFixed(1), '| after v=', after.v.toFixed(0));
await browser.close();
