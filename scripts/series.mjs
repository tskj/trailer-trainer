import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(3600);   // full speed
await page.keyboard.down('f');                                    // full steer, hold
const rows=[];
for(let i=0;i<24;i++){ await page.waitForTimeout(80); const t=await tt(); rows.push(`om=${t.om.toFixed(2)} vlat=${t.vlat.toFixed(0)} omT=${t.omT.toFixed(2)} artic=${t.artic.toFixed(0)} v=${t.v.toFixed(0)}`); }
await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:',errs.length?errs.join('|'):'(none)');
rows.forEach((r,i)=>console.log(String(i).padStart(2),r));
await browser.close();
