import { chromium } from 'playwright';
const DIR='/tmp/claude-1000/-home-tskj-code-trailer-trainer/2a7e12cd-4720-4e93-b5c2-750b690cef6f/scratchpad/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1100,height:820}, deviceScaleFactor:2 });
const errs=[]; page.on('pageerror',e=>errs.push('PAGEERR:'+e.message));
page.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE:'+m.text()); });
await page.goto('http://localhost:5173/',{waitUntil:'networkidle'});
await page.waitForTimeout(400);
const tt=async()=>await page.evaluate(()=>window.__tt());
// perturbation: load each level a few times, record starting articulation
const artics={};
for(const i of [0,1,2,3,7]){
  const samples=[];
  for(let r=0;r<4;r++){
    await page.evaluate(idx=>document.querySelectorAll('#levelList .lvl')[idx].click(), i);
    await page.waitForTimeout(150);
    samples.push(+(await tt()).artic.toFixed(2));
  }
  artics['lvl'+i]=samples;
}
// shadow: free drive, drive forward a bit so the rig sits on open tarmac, screenshot
await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0].click());
await page.waitForTimeout(300);
await page.keyboard.down('e'); await page.waitForTimeout(1400); await page.keyboard.up('e');
await page.waitForTimeout(500);
await page.screenshot({path:DIR+'shadow.png',timeout:90000});
console.log('errors:', errs.length?errs.join('\n'):'(none)');
console.log('starting articulation per level (deg, 4 loads each):', JSON.stringify(artics));
await browser.close();
