import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(4000);
const cruise=await tt();
await page.keyboard.down('f');
let peak=0, samples=[];
for(let i=0;i<20;i++){ await page.waitForTimeout(120); const t=await tt(); peak=Math.max(peak,Math.abs(t.vlat)); if(i%4===0) samples.push({v:t.v.toFixed(0),vlat:t.vlat.toFixed(1),om:t.om.toFixed(2),delta:(t.delta*57.3).toFixed(0)}); }
await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('cruise v=',cruise.v.toFixed(0),'delta=',(cruise.delta*57.3).toFixed(0));
console.log('peak |vlat| during steer:', peak.toFixed(1));
console.log('samples:', JSON.stringify(samples));
await browser.close();
