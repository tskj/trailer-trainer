// Headless screenshot + console/error capture for the dev server.
// Usage: node scripts/shot.mjs [outfile.png] [waitMs] [url]
import { chromium } from 'playwright';

const out   = process.argv[2] || '/tmp/claude-1000/-home-tskj-code-trailer-trainer/77e629aa-3ec3-411c-ac79-d1a92cf1f8b3/scratchpad/shot.png';
const waitMs= Number(process.argv[3] || 1500);
const url   = process.argv[4] || 'http://localhost:5173/';

const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }).then(c => c.newPage());

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText||''}`));

await page.goto(url, { waitUntil: 'networkidle' }).catch(e => logs.push(`[goto] ${e.message}`));
await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });
await browser.close();

console.log('--- console/errors ---');
console.log(logs.length ? logs.join('\n') : '(none)');
console.log('--- screenshot ---');
console.log(out);
