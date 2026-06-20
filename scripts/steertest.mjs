import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:740} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/', {waitUntil:'networkidle'});
await page.waitForTimeout(400);
const rect = await page.evaluate(()=>{ const r=document.querySelector('.stage').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
// small offset right of centre (~6% of half-width) — old centre-snap would zero this
await page.mouse.move(cx + rect.w*0.03, cy);
await page.waitForTimeout(600);                 // many sim ticks; if snap fought it, hSteer -> 0
const small = await page.textContent('#hSteer');
// centre exactly -> should read ~0
await page.mouse.move(cx, cy);
await page.waitForTimeout(400);
const centre = await page.textContent('#hSteer');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('slightly-off-centre steer (held?):', JSON.stringify(small), '| cursor-centred:', JSON.stringify(centre));
await browser.close();
