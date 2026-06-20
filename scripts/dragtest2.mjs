import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(2800);
await page.keyboard.down('f'); await page.waitForTimeout(500);
await page.keyboard.down('Shift');
let peakOm=0, peakVlat=0, peakArt=0, bad=false;
for(let i=0;i<20;i++){ await page.waitForTimeout(90); const t=await tt(); peakOm=Math.max(peakOm,Math.abs(t.om)); peakVlat=Math.max(peakVlat,Math.abs(t.vlat)); peakArt=Math.max(peakArt,Math.abs(t.artic)); if(!isFinite(t.v)||Math.abs(t.v)>4000) bad=true; }
await page.keyboard.up('Shift'); await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('blewUp:',bad,'errors:',errs.length?errs.join('|'):'(none)');
console.log('peak om:',peakOm.toFixed(2),'| peak car vlat:',peakVlat.toFixed(0),'| peak artic:',peakArt.toFixed(0));
await browser.close();
