// Records the raw frames for the demo video. Usage:
//   node scripts/record-demo.mjs desktop|vertical <outDir> [baseUrl]
// Frames come from the Chrome screencast (CDP), one JPEG per painted frame, with timestamps.
// scripts/build-video.py turns them into the edited video.
//
// Demo mode: the demo URL is opened on the local origin (127.0.0.1) before any frame is
// captured, and the resulting cookie is copied to the public origin. The token is read from
// .env, never printed, and never reaches a recorded page or the nginx access log.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2] || 'desktop';
const outDir = process.argv[3] || `/tmp/geoletter-rec/${mode}`;
const base = (process.argv[4] || 'https://geoletter.tech').replace(/\/$/, '');
const local = 'http://127.0.0.1:3520';
mkdirSync(join(outDir, 'frames'), { recursive: true });

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const token = /^ADMIN_TOKEN=(.*)$/m.exec(envText)?.[1]?.trim() ?? '';
if (!token) throw new Error('ADMIN_TOKEN missing in .env');

const vertical = mode === 'vertical';
const viewport = vertical ? { width: 432, height: 768 } : { width: 1280, height: 720 };
const scale = vertical ? 2.5 : 1.5;
const out = { width: viewport.width * scale, height: viewport.height * scale };

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  // The forced scale makes the screencast deliver device pixels (1080p) instead of CSS pixels.
  // GL_RESOLVE=ip pins the public host when the local DNS resolver misbehaves.
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', `--force-device-scale-factor=${vertical ? 2.5 : 1.5}`,
    ...(process.env.GL_RESOLVE ? [`--host-resolver-rules=MAP ${new URL(base).hostname} ${process.env.GL_RESOLVE}`] : [])],
});
const ctx = await browser.newContext({
  viewport, deviceScaleFactor: scale, isMobile: vertical, hasTouch: vertical,
  locale: 'en-US', timezoneId: 'America/Sao_Paulo', bypassCSP: true,
  // São Paulo: the sealed letter in Lagos is a real ocean away.
  geolocation: { latitude: -23.5505, longitude: -46.6333 },
});
await ctx.grantPermissions(['geolocation'], { origin: base });

// A visible pointer, since headless Chrome draws none.
await ctx.addInitScript((touch) => {
  const make = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    const s = c.style;
    s.position = 'fixed'; s.left = '0'; s.top = '0'; s.zIndex = '2147483647'; s.pointerEvents = 'none';
    s.transition = 'opacity .2s';
    if (touch) {
      s.width = '30px'; s.height = '30px'; s.margin = '-15px 0 0 -15px'; s.borderRadius = '50%';
      s.background = 'rgba(46,36,28,.22)'; s.border = '1.5px solid rgba(46,36,28,.45)'; s.opacity = '0';
    } else {
      s.width = '22px'; s.height = '22px';
      s.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Cpath d='M3 2l14 9-6 1.4-3.2 5.6z' fill='%232e241c' stroke='%23fbf3e2' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E\")";
      s.backgroundSize = 'contain';
    }
    document.documentElement.append(c);
    addEventListener('mousemove', (e) => { s.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, true);
    addEventListener('mousedown', () => {
      if (touch) { s.opacity = '1'; } else { s.scale = '.85'; }
    }, true);
    addEventListener('mouseup', () => {
      if (touch) setTimeout(() => { s.opacity = '0'; }, 250); else s.scale = '1';
    }, true);
  };
  // No red spellcheck squiggles under a Spanish letter typed in an English browser.
  new MutationObserver(() => document.querySelectorAll('textarea, input').forEach((e) => { e.spellcheck = false; }))
    .observe(document, { childList: true, subtree: true });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', make); else make();
}, vertical);

// Keep a handle on the MapLibre map, so the script knows where a place is on screen.
await ctx.addInitScript(() => {
  let real;
  Object.defineProperty(window, 'maplibregl', {
    configurable: true,
    get() { return real; },
    set(v) {
      const M = v.Map;
      Object.defineProperty(v, 'Map', { value: class extends M { constructor(o) { super(o); window.__map = this; } }, configurable: true, writable: true });
      real = v;
    },
  });
});

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)));

// ---------- demo cookie, before anything is recorded ----------
{
  const r = await page.goto(`${local}/?demo=1&token=${encodeURIComponent(token)}`);
  if (!r) throw new Error('no response for demo URL');
  const c = (await ctx.cookies(local)).find((x) => x.name === 'gl_demo');
  if (!c) throw new Error('demo cookie was not set (wrong token?)');
  await ctx.addCookies([{ name: 'gl_demo', value: c.value, domain: new URL(base).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: c.expires }]);
  await ctx.clearCookies({ domain: '127.0.0.1' });
  await page.goto('about:blank');
}

// Remember what this run creates, so it can be marked as an example or deleted afterwards.
const created = [];
page.on('response', async (res) => {
  if (res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/offerings') {
    try { const j = await res.json(); if (j.id) { created.push({ id: j.id, status: j.status }); console.log('created', j.id); } } catch { /* ignore */ }
  }
});

// ---------- screencast ----------
const frames = [];
const marks = [];
let cdp = null;
let n = 0;
const mark = (name) => { marks.push({ name, t: Date.now() / 1000 }); console.log('mark', name); };

async function startCast() {
  if (cdp) { try { await cdp.send('Page.stopScreencast'); } catch { /* gone */ } try { await cdp.detach(); } catch { /* gone */ } }
  cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    const file = `f${String(n++).padStart(6, '0')}.jpg`;
    writeFileSync(join(outDir, 'frames', file), Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: out.width, maxHeight: out.height, everyNthFrame: 1 });
}

const wait = (ms) => page.waitForTimeout(ms);
let cursor = { x: viewport.width * 0.62, y: viewport.height * 0.55 };
async function moveTo(x, y, steps = 28) {
  await page.mouse.move(x, y, { steps });
  cursor = { x, y };
}
async function click(locator, { pause = 350, steps = 28 } = {}) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await el.scrollIntoViewIfNeeded();
  await wait(250);
  const b = await el.boundingBox();
  if (!b) throw new Error('no box for ' + locator);
  await moveTo(b.x + Math.min(b.width / 2, 60), b.y + b.height / 2, steps);
  await wait(pause);
  await page.mouse.down();
  await wait(90);
  await page.mouse.up();
}
async function gotoPage(url) {
  await page.goto(url);
  await page.mouse.move(cursor.x, cursor.y);
  await startCast();
}
async function waitText(selector, re, timeout = 240000) {
  await page.waitForFunction(([s, r]) => {
    const el = document.querySelector(s);
    return el && new RegExp(r).test(el.textContent || '');
  }, [selector, re.source], { timeout, polling: 200 });
}

const t0 = Date.now() / 1000;
try {
  // 1. The world.
  await page.goto(`${base}/`);
  await page.waitForSelector('#recent-list li', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#map canvas'), null, { timeout: 30000 });
  await wait(6000); // tiles
  const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
  if (!cfg.demo) throw new Error('demo cookie did not reach the public origin');
  await page.mouse.move(cursor.x, cursor.y);
  await startCast();
  mark('world');
  await moveTo(viewport.width * 0.55, viewport.height * 0.45, 60);
  await wait(4500);

  // 2. Arrive at a place: zoom in on Oaxaca with the wheel and touch its light.
  const oax = [-96.7216, 17.0594];
  const px = () => page.evaluate((ll) => window.__map.project(ll), oax);
  mark('fly');
  let p = await px();
  await moveTo(p.x, p.y, 45);
  await wait(500);
  for (let i = 0; i < 40; i++) {
    const z = await page.evaluate(() => window.__map.getZoom());
    if (z >= 14) break;
    p = await px();
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, -320);
    await wait(200);
  }
  await wait(1400);
  p = await px();
  await moveTo(p.x, p.y, 10);
  await wait(300);
  await page.mouse.down(); await wait(90); await page.mouse.up();
  await page.waitForSelector('.offering-list li', { timeout: 30000 });
  await wait(3000);
  mark('place');
  const item = page.locator('.offering-list li', { hasText: 'Abuela Chayo' });
  await moveTo(...(await (async () => { const b = await item.boundingBox(); return [b.x + b.width * 0.6, b.y + 20]; })()), 30);
  await wait(2200);

  // 3. Open the letter: paper.
  mark('read-click');
  await click(item.locator('a', { hasText: 'Read the letter' }));
  await page.waitForURL(/\/l\//);
  await page.mouse.move(cursor.x, cursor.y);
  await startCast();
  mark('letter');
  await wait(3500);
  await page.mouse.wheel(0, vertical ? 500 : 260);
  await wait(3000);

  // 4. Leave a marigold at the same place.
  await gotoPage(`${base}/#17.0594,-96.7216`);
  await page.waitForSelector('.offering-list li', { timeout: 30000 });
  await wait(1500);
  mark('flower');
  await click(page.locator('#view button', { hasText: 'Leave something here too' }));
  await page.waitForSelector('.compose');
  await wait(1600);
  mark('flower-submit');
  await click(page.locator('.compose [data-submit]'));
  await page.waitForSelector('.waiting', { timeout: 20000 });
  await wait(3000);
  mark('flower-done');

  // 5. A new letter, in Spanish, at a market in Buenos Aires.
  await click(page.locator('#view button', { hasText: 'Back to the map' }));
  await wait(1200);
  mark('search');
  await click('#q');
  await page.keyboard.type('Mercado de San Telmo', { delay: 55 });
  await wait(300);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#results li button', { timeout: 20000 });
  await wait(1000);
  await click(page.locator('#results li button').first());
  await page.waitForSelector('.compose');
  await wait(2800);
  mark('compose');
  await click(page.locator('.compose input[name="kind"][value="letter"]'));
  await wait(500);
  await click('.compose input[name="to"]');
  await page.keyboard.type('Tío Ernesto', { delay: 60 });
  await wait(300);
  await click('.compose textarea[name="body"]');
  mark('typing');
  await page.keyboard.type(
    'Tío:\n\nHoy pasé por el mercado y el puesto de discos sigue ahí. El dueño nuevo no sabe quién eras, pero puso un tango de Pugliese y me quedé hasta el final, como los sábados.\n\nTodavía tengo tu radio. Funciona si le pegás de costado.',
    { delay: 22 },
  );
  mark('typed');
  await wait(600);
  await click('.compose input[name="from"]');
  await page.keyboard.type('Caro', { delay: 70 });
  await wait(800);
  mark('letter-submit');
  await click(page.locator('.compose [data-submit]'));
  await page.waitForSelector('.waiting', { timeout: 20000 });
  mark('queued');
  // Follow the candle line as the guardian works.
  let last = '';
  const t1 = Date.now();
  while (Date.now() - t1 < 300000) {
    const line = await page.locator('.waiting .flame-line p').textContent().catch(() => '');
    if (line !== last) { last = line; mark('line:' + line.slice(0, 40)); }
    if (/let it through|kept it back/.test(line)) break;
    await wait(250);
  }
  if (!/let it through/.test(last)) throw new Error('guardian did not approve: ' + last);
  mark('approved');
  await wait(3200);

  // 6. Its page, and the translation.
  await click(page.locator('.waiting a', { hasText: 'Open its page' }));
  await page.waitForURL(/\/l\//);
  await page.mouse.move(cursor.x, cursor.y);
  await startCast();
  mark('newletter');
  await wait(3000);
  const tr = page.locator('#translate');
  await tr.waitFor({ state: 'visible', timeout: 10000 });
  mark('translate-click');
  await click(tr);
  await waitText('#translate-state', /Translated by Gemma/, 180000);
  mark('translated');
  await wait(800);
  await moveTo(viewport.width * 0.8, viewport.height * 0.5, 30);
  await wait(4500);

  // 7. The sealed letter in Lagos.
  await gotoPage(`${base}/#6.4253,3.4219`);
  await page.waitForSelector('.offering-list li', { timeout: 30000 });
  await wait(1200);
  mark('lagos');
  await wait(2600);
  await click(page.locator('.offering-list a', { hasText: 'Go to the letter' }));
  await page.waitForURL(/\/l\//);
  await page.mouse.move(cursor.x, cursor.y);
  await startCast();
  mark('sealed');
  await wait(2800);
  await click('#open-here');
  await page.waitForSelector('#distance:not([hidden])', { timeout: 20000 });
  mark('distance');
  await wait(3800);
  await click('#open-demo');
  await page.waitForSelector('#letter-body', { timeout: 20000 });
  mark('opened');
  await wait(3500);
  await page.mouse.wheel(0, vertical ? 450 : 220);
  await wait(2500);

  // 8. Help me find the words (kept out of the final cut if it does not fit).
  await gotoPage(`${base}/#-22.32460,-49.08710`);
  await page.waitForSelector('.compose', { timeout: 30000 });
  await wait(2000);
  mark('help');
  await click(page.locator('.compose input[name="kind"][value="letter"]'));
  await wait(400);
  await click('.compose input[name="to"]');
  await page.keyboard.type('Vó Lurdes', { delay: 60 });
  await click('.compose details.assist summary');
  await wait(600);
  await click('.compose textarea[name="notes"]');
  await page.keyboard.type('she sang off-key while ironing on Sundays; the mango tree behind the house; I was twelve and stole the green ones', { delay: 22 });
  await wait(500);
  mark('draft-click');
  await click('.compose [data-draft]');
  await waitText('.compose [data-draft-state]', /Here is a draft|wrong|Try again|Too many/, 240000);
  mark('drafted');
  await page.locator('.compose textarea[name="body"]').scrollIntoViewIfNeeded();
  await wait(5000);

  // 9. Back to the world.
  await gotoPage(`${base}/`);
  await wait(6000);
  mark('end');
  await wait(4000);
} catch (e) {
  console.log('ERROR', e.message.slice(0, 300));
  mark('error');
} finally {
  mark('stop');
  try { await cdp?.send('Page.stopScreencast'); } catch { /* gone */ }
  writeFileSync(join(outDir, 'frames.json'), JSON.stringify(frames));
  writeFileSync(join(outDir, 'marks.json'), JSON.stringify({ t0, marks, viewport, scale, out }, null, 1));
  writeFileSync(join(outDir, 'created.json'), JSON.stringify(created, null, 1));
  console.log(`frames ${frames.length}, created ${created.length}, ${(Date.now() / 1000 - t0).toFixed(0)} s`);
  await browser.close();
}
