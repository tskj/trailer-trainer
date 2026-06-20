import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/action.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:740}, deviceScaleFactor:1.5 });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.waitForTimeout(400);
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click()); // free drive
await page.waitForTimeout(300);
await page.keyboard.down('e');              // forward
await page.waitForTimeout(700);
await page.keyboard.down('f');              // steer right
await page.waitForTimeout(1300);
await page.keyboard.up('f'); await page.keyboard.up('e');
await page.waitForTimeout(900);             // coast so we see an angled pose
await page.screenshot({ path: out });
console.log('errors:', errs.length?errs.join('|'):'(none)', '->', out);
await browser.close();
