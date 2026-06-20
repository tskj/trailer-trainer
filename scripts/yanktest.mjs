import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
await page.keyboard.down('e'); await page.waitForTimeout(3500);
await page.keyboard.down('f');                          // hard turn at speed -> fold -> yank
let bad=false;
for(let i=0;i<25;i++){ await page.waitForTimeout(100); const t=await tt();
  if(!isFinite(t.v)||!isFinite(t.artic)||!isFinite(t.om)||Math.abs(t.v)>2000) bad=true; }
const end=await tt();
await page.keyboard.up('f'); await page.keyboard.up('e');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('blew up?', bad, '| end:', JSON.stringify({v:end.v.toFixed(0),vlat:end.vlat.toFixed(0),om:end.om.toFixed(2),omT:end.omT.toFixed(2),artic:end.artic.toFixed(0)}));
await browser.close();
