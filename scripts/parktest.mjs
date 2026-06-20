import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[4]?.click()); // level 5 (straight back-in)
await page.waitForTimeout(300);
const tt=async()=>await page.evaluate(()=>window.__tt());
// gentle reverse with a little steer (parking-style), sampling
await page.keyboard.down('d');
let s=[];
for(let i=0;i<10;i++){ await page.waitForTimeout(150); const t=await tt();
  if(i===3) await page.keyboard.down('s');                 // add a little left steer mid-reverse
  s.push({v:t.v.toFixed(1), art:((t.theta-t.phi)*57.3).toFixed(1), om:t.om.toFixed(2)}); }
await page.keyboard.up('d'); await page.keyboard.up('s');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('low-speed reverse samples (v, artic°, yaw):');
s.forEach(x=>console.log('  ',JSON.stringify(x)));
await browser.close();
