import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:5174/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForTimeout(300);

// touch UI should be active (coarse pointer) and controls visible
const ui = await page.evaluate(()=>({
  touchClass: document.body.classList.contains('touch'),
  coarse: matchMedia('(pointer: coarse)').matches,
  steerVisible: getComputedStyle(document.getElementById('touchSteer')).display!=='none',
  thrVisible: getComputedStyle(document.getElementById('touchThrottle')).display!=='none',
}));
console.log('UI:', JSON.stringify(ui));

await page.evaluate(()=>document.querySelectorAll('#levelList .lvl')[0]?.click()); // free drive
await page.waitForTimeout(300);

// dispatch a touch (start/move/end) on an element at a fraction of its own rect
async function touch(id, fx, fy, type){
  await page.evaluate(({id,fx,fy,type})=>{
    const el=document.getElementById(id), r=el.getBoundingClientRect();
    const x=r.left+r.width*fx, y=r.top+r.height*fy;
    const t=new Touch({identifier:1,target:el,clientX:x,clientY:y,pageX:x,pageY:y});
    const lists = type==='touchend' ? {touches:[],targetTouches:[],changedTouches:[t]}
                                    : {touches:[t],targetTouches:[t],changedTouches:[t]};
    el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,...lists}));
  },{id,fx,fy,type});
}
const tt=async()=>await page.evaluate(()=>window.__tt());

// --- throttle: push the slider near the top -> forward; v should climb ---
await touch('touchThrottle',0.5,0.08,'touchstart');
await page.waitForTimeout(900);
const fwd=await tt();
await touch('touchThrottle',0.5,0.08,'touchend');
await page.waitForTimeout(600);

// --- throttle: push near the bottom -> reverse; v should go negative ---
await touch('touchThrottle',0.5,0.94,'touchstart');
await page.waitForTimeout(900);
const rev=await tt();
await touch('touchThrottle',0.5,0.94,'touchend');

// --- steering: far right of the zone -> delta positive (R); far left -> negative ---
await touch('touchSteer',0.95,0.5,'touchstart'); await page.waitForTimeout(120);
const right=await tt();
await touch('touchSteer',0.05,0.5,'touchstart'); await page.waitForTimeout(120);
const left=await tt();
await touch('touchSteer',0.5,0.5,'touchstart'); await page.waitForTimeout(120);
const centre=await tt();
await touch('touchSteer',0.5,0.5,'touchend');

console.log('errors:', errs.length?errs.join('|'):'(none)');
console.log('throttle fwd: v=%s  (want > 0)', fwd.v.toFixed(1));
console.log('throttle rev: v=%s  (want < 0)', rev.v.toFixed(1));
console.log('steer right : delta=%s°  (want > 0)', right.delta.toFixed(2)*57.3|0, '->', (right.delta*57.3).toFixed(1));
console.log('steer left  : delta=%s°  (want < 0)', (left.delta*57.3).toFixed(1));
console.log('steer centre: delta=%s°  (want ~0)', (centre.delta*57.3).toFixed(1));
await browser.close();
