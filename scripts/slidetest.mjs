import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760}, deviceScaleFactor:1.5 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click()); // free drive
await page.waitForTimeout(300);
const read = async()=>({ spd:(await page.textContent('#hSpeed')).trim(), st:(await page.textContent('#status')).trim(), art:(await page.textContent('#hArtic')).trim() });
// accelerate hard
await page.keyboard.down('e'); await page.waitForTimeout(3500);
const cruise = await read();
// yank the wheel right while flooring it -> should break traction
await page.keyboard.down('f'); await page.waitForTimeout(1600);
const slide = await read();
await page.keyboard.up('f'); await page.keyboard.up('e');
await page.screenshot({ path: out });
await page.waitForTimeout(2500);
// reverse + steer (trailer stability)
await page.keyboard.down('d'); await page.keyboard.down('s'); await page.waitForTimeout(1500);
const rev = await read();
await page.keyboard.up('d'); await page.keyboard.up('s');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('cruise:', JSON.stringify(cruise));
console.log('slide :', JSON.stringify(slide));
console.log('rev   :', JSON.stringify(rev));
await browser.close();
