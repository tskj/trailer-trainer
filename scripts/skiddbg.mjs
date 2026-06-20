import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(3500);
await page.keyboard.down('f');
let peakAr=0, peakSk=0;
for(let i=0;i<16;i++){ await page.waitForTimeout(120); const t=await tt(); peakAr=Math.max(peakAr,t.ar||0); peakSk=Math.max(peakSk,t.skids||0); }
const end=await tt();
await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('peak ar=', peakAr.toFixed(2), '(thresh 0.18) | peak skids=', peakSk, '| end ar=', (end.ar||0).toFixed(2), 'gl=', (end.gl||0).toFixed(2), 'skids=', end.skids);
await browser.close();
