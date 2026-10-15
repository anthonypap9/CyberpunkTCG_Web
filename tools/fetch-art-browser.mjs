// Downloads card art using YOUR installed Chrome/Edge (the image server blocks plain Node requests).
// Setup once:   npm i playwright-core
// Run:          node tools/fetch-art-browser.mjs          (add --show to watch the browser)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CARDS } from '../www/js/cards.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'art');
fs.mkdirSync(OUT, { recursive: true });
const show = process.argv.includes('--show');
let browser;
for (const channel of ['chrome', 'msedge']) {
  try { browser = await chromium.launch({ channel, headless: !show }); console.log('Using', channel); break; } catch (e) { console.log(channel, 'not available:', e.message.split('\n')[0]); }
}
if (!browser) { console.log('No Chrome or Edge found.'); process.exit(1); }
const page = await (await browser.newContext()).newPage();
const slugs = Object.keys(CARDS);
let ok = 0; const miss = [];
for (const s of slugs) {
  const file = path.join(OUT, s + '.webp');
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) { ok++; continue; }
  try {
    const seen = [];
    const onResp = (x) => { if (/cloudfront\.net.*\.webp/.test(x.url())) seen.push(x); };
    page.on('response', onResp);
    await page.goto(`https://cyberpunktcg.com/cards/${s}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('meta[property="og:image"]', { state: 'attached', timeout: 15000 });
    const url = await page.evaluate(() => document.querySelector('meta[property="og:image"]').content);
    if (!url) throw new Error('no og:image');
    const base = url.split('?')[0];
    for (let t = 0; t < 20 && !seen.some((x) => x.url().split('?')[0] === base && x.ok()); t++) await page.waitForTimeout(250);
    page.off('response', onResp);
    const r = seen.find((x) => x.url().split('?')[0] === base && x.ok());
    let buf;
    if (r) buf = await r.body();
    else {
      const r2 = await page.goto(url, { referer: 'https://cyberpunktcg.com/', timeout: 30000 });
      if (!r2 || !r2.ok()) throw new Error('image status ' + (r2 ? r2.status() : 'none') + ` (page loaded ${seen.length} images, none matched)`);
      buf = await r2.body();
    }
    if (buf.length < 1000) throw new Error('tiny image');
    fs.writeFileSync(file, buf);
    ok++; console.log('ok  ', s);
  } catch (e) { miss.push(s); console.log('MISS', s, '-', e.message.split('\n')[0]); }
}
await browser.close();
console.log(`\nDone: ${ok} saved, ${miss.length} missed${miss.length ? ': ' + miss.join(', ') : ''}`);
