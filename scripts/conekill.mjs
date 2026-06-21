import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:760} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await page.waitForTimeout(300);
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[3].click());  // Garage cone channel
await page.waitForTimeout(300);
const peek=async()=>await page.evaluate(()=>({shown:document.getElementById('dead').classList.contains('show'),big:document.getElementById('deadBig').textContent}));
const tt=async()=>await page.evaluate(()=>window.__tt());
const deaths=[]; let prev=false;
await page.keyboard.down('d');                 // reverse
await page.keyboard.down('l'); await page.waitForTimeout(130); await page.keyboard.up('l');  // brief gentle kink
let maxArtic=0;
for(let i=0;i<70;i++){
  await page.waitForTimeout(80);
  const d=await peek(); const t=await tt(); maxArtic=Math.max(maxArtic,Math.abs(t.artic));
  if(d.shown&&!prev){ deaths.push(d.big); break; }   // first crash
  prev=d.shown;
}
await page.keyboard.up('d');
console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('first crash:', deaths[0]||'(none in window)', '| max |artic| seen before crash:', maxArtic.toFixed(0)+'deg');
console.log('cone crash observed:', deaths.includes('Cone down!') ? 'YES ✓' : 'no');
await browser.close();
