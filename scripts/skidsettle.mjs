import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1000,height:780}, deviceScaleFactor:1.4 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click());
await page.waitForTimeout(300);
await page.evaluate(()=>document.getElementById('btnCam')?.click());  // top-down
await page.waitForTimeout(200);
await page.keyboard.down('e'); await page.waitForTimeout(1300);
await page.keyboard.down('f'); await page.waitForTimeout(900);
await page.keyboard.up('e'); await page.keyboard.up('f');
await page.keyboard.down('Control'); await page.waitForTimeout(1500); await page.keyboard.up('Control'); // brake to stop
await page.waitForTimeout(2500);                                      // let camera settle on the rig
const sk=await page.evaluate(()=>window.__tt().skids);
await page.screenshot({ path: process.argv[2] });
console.log('errors:', errs.length?errs.join('|'):'(none)', '| skid quads:', sk);
await browser.close();
