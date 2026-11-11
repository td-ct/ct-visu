import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2500);

const read = id => page.locator('#' + id).textContent();
console.log('initial step:', await read('stepLabel'));

await page.click('#btnPlay');
await page.selectOption('#speed', '4');
await page.waitForTimeout(6000);
console.log('step @6s:', await read('stepLabel'));
console.log('tblPos:', await read('tblPosVal'), 'tblHeight:', await read('tblHeightVal'));

await page.waitForTimeout(30000);
console.log('step @36s:', await read('stepLabel'));
console.log('DLP gesamt:', await read('rDlpTotal'), 'Zeit:', await read('rTime'));

await page.click('#btnPlay');
await page.waitForTimeout(300);
await page.$eval('#tblHeight', el => { el.value = '0.55'; el.dispatchEvent(new Event('input')); });
await page.$eval('#tblPos', el => { el.value = '-1.5'; el.dispatchEvent(new Event('input')); });
const posVal = await page.$eval('#tblPos', el => el.value);
const posMin = await page.$eval('#tblPos', el => el.min);
const hVal = await page.$eval('#tblHeight', el => el.value);
console.log('manual: posVal=', posVal, 'posMin=', posMin, 'heightVal=', hVal, 'hint:', await read('tblHint'));

await page.screenshot({ path: 'scripts/smoke.png' });
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
