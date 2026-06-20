import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:740} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click()); // free drive
await page.waitForTimeout(300);
const steer = async()=> (await page.textContent('#hSteer')).trim();

// TAP right (~120ms) then release; sample the decay
await page.keyboard.down('f'); await page.waitForTimeout(120); await page.keyboard.up('f');
const tapPeak = await steer();
await page.waitForTimeout(250); const tapMid = await steer();
await page.waitForTimeout(900); const tapEnd = await steer();

// HOLD right ~1.3s -> should approach full lock (~36)
await page.keyboard.down('f'); await page.waitForTimeout(1300); const held = await steer(); await page.keyboard.up('f');
await page.waitForTimeout(1500);

// MOUSE: move well off-centre, should HOLD (set-and-hold)
const r = await page.evaluate(()=>{const b=document.querySelector('.stage').getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};});
await page.mouse.move(r.x + r.w*0.80, r.y + r.h/2);
const mouseSet = await steer();
await page.waitForTimeout(700); const mouseHold = await steer();   // no key -> must NOT decay

console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('tap: peak',tapPeak,'-> +250ms',tapMid,'-> +1.1s',tapEnd);
console.log('hold 1.3s:', held);
console.log('mouse set:', mouseSet, '-> held 700ms:', mouseHold);
await browser.close();
