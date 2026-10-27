// Takes the screenshots in docs/. Usage: node scripts/screenshots.mjs [baseUrl]
// Needs a local Chrome/Chromium (CHROME_PATH, default /usr/bin/google-chrome).
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://127.0.0.1:3520';
const out = new URL('../docs/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function shot(name, viewport, fn, mobile = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console:`, m.text()); });
  await fn(page);
  await page.screenshot({ path: `${out}${name}.png` });
  console.log('saved', name);
  await ctx.close();
}

const offerings = await (await fetch(`${base}/api/offerings`)).json();
const byPlace = async (needle) => {
  for (const f of offerings.features) {
    const o = await (await fetch(`${base}/api/offerings/${f.properties.id}`)).json();
    if ((o.place || '').includes(needle)) return o;
  }
  throw new Error('not found: ' + needle);
};
const oaxaca = await byPlace('Oaxaca');
const lagos = await byPlace('Lagos');

await shot('map-desktop', { width: 1440, height: 900 }, async (page) => {
  await page.goto(`${base}/#${oaxaca.lat},${oaxaca.lng}`);
  await page.waitForSelector('.offering-list li', { timeout: 30000 });
  await page.waitForTimeout(4000);
});

await shot('world-desktop', { width: 1440, height: 900 }, async (page) => {
  await page.goto(`${base}/`);
  await page.waitForTimeout(6000);
});

await shot('letter-mobile', { width: 390, height: 844 }, async (page) => {
  await page.goto(`${base}/l/${oaxaca.id}`);
  await page.waitForTimeout(1200);
}, true);

await shot('sealed-mobile', { width: 390, height: 844 }, async (page) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 6.5244, longitude: 3.3792 });
  await page.goto(`${base}/l/${lagos.id}`);
  await page.click('#open-here');
  await page.waitForSelector('#distance:not([hidden])');
  await page.waitForTimeout(500);
}, true);

await shot('map-mobile', { width: 390, height: 844 }, async (page) => {
  await page.goto(`${base}/`);
  await page.waitForTimeout(6000);
}, true);

await shot('compose-mobile', { width: 390, height: 844 }, async (page) => {
  await page.goto(`${base}/`);
  await page.waitForTimeout(4000);
  await page.mouse.click(195, 180);
  await page.waitForSelector('.compose');
  await page.check('input[name="kind"][value="letter"]');
  await page.fill('input[name="to"]', 'Abuela Chayo');
  await page.waitForTimeout(2500);
}, true);

await browser.close();
