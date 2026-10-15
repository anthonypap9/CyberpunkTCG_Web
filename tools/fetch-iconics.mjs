// Finds Iconic alt-art printings (numbers #141+ / #β141+) on cyberpunktcg.com and saves them as www/art/<card>~iconic.webp,
// then writes www/art/iconics.json (the list the game reads). Uses YOUR installed Chrome/Edge.
// Run:  node tools/fetch-iconics.mjs        (add --show to watch; safe to re-run, it skips what it already has)
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
  try { browser = await chromium.launch({ channel, headless: !show }); console.log('Using', channel); break; } catch (e) { console.log(channel, 'not available'); }
}
if (!browser) { console.log('No Chrome or Edge found.'); process.exit(1); }
const page = await (await browser.newContext()).newPage();
const found = new Set();
for (const s of Object.keys(CARDS)) {
  const s0 = s;
  const file = path.join(OUT, s + '~iconic.webp');
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) { found.add(s); continue; }
  try {
    await page.goto(`https://cyberpunktcg.com/cards/${s}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(800);
    // every printing link on the card page, with its visible text (set + number)
    const baseImg = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content || '');
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="printing="]')].map((a) => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim() })));
    const num = (t) => { const m = t.match(/#?\s*(β)?\s*(\d{3})\b/i); return m ? { beta: !!m[1], n: +m[2] } : null; };
    const iconic = links.map((l) => ({ ...l, k: num(l.text) })).filter((l) => l.k && l.k.n >= 141);
    if (!iconic.length) { continue; }
    iconic.sort((a, b) => (b.k.beta - a.k.beta));
    const pick = iconic[0];
    const uuid = new URL(pick.href).searchParams.get('printing');
    const seen = [];
    const onResp = (x) => { if (/cloudfront\.net/.test(x.url())) seen.push(x); };
    page.on('response', onResp);
    await page.goto(pick.href, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('meta[property="og:image"]', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(2000);
    const strip = (u) => (u || '').split('?')[0];
    // the printing page's own card image(s): every CloudFront image actually shown on the page
    const imgs = await page.evaluate(() => [...document.images].map((i) => i.currentSrc || i.src).filter((u) => /cloudfront\.net/.test(u)));
    const og = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content || '');
    const cands = [...new Set([...imgs, og].map(strip))].filter((u) => u && u !== strip(baseImg));
    if (!cands.length) {
      console.log('   debug', s0, '| links:', links.map((l) => l.text + ' => ' + (l.href.split('printing=')[1] || '')).join(' ; '));
      console.log('   debug images on printing page:', imgs.map(strip).join(' , '), '| base:', strip(baseImg));
      throw new Error('no image different from the normal art for ' + uuid);
    }
    const url = cands[0];
    page.off('response', onResp);
    const strip2 = (u) => u.split('?')[0];
    const r = seen.find((x) => strip2(x.url()) === url && x.ok());
    let buf;
    if (r) buf = await r.body();
    else {
      const r2 = await page.goto(url, { referer: 'https://cyberpunktcg.com/', timeout: 30000 });
      if (!r2 || !r2.ok()) throw new Error('image status ' + (r2 ? r2.status() : 'none') + ` (page loaded ${seen.length} images, none matched)`);
      buf = await r2.body();
    }
    if (buf.length < 1000) throw new Error('tiny image');
    fs.writeFileSync(file, buf); found.add(s); console.log('ICONIC', s, '-', pick.text);
  } catch (e) { console.log('MISS', s, '-', e.message.split('\n')[0]); }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'iconics.json'), JSON.stringify([...found].sort()));
console.log(`\nDone: ${found.size} Iconic card(s). Wrote art/iconics.json`);
